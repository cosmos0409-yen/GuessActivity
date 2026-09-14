// 一場遊戲 = 一個 Durable Object（SQLite backend）。
//
// 為什麼玩家一加入、每筆作答都寫 SQLite（規格確認文件 T2）：
//   使用 WebSocket Hibernation API 時，DO 閒置約 10 秒會休眠、之後可能被移出記憶體，
//   記憶體裡的變數會全部消失。所以名單、作答、房間狀態一律以 SQLite 為準，醒來時從 SQLite 讀回。
//   每條 WebSocket 的身分（host／playerId）用 serializeAttachment 記在連線上，同樣能撐過休眠。
//   一場 150 人 × 10 題約寫 1,500 列，免費額度每天 10 萬列，足夠。
import { DurableObject } from "cloudflare:workers";
import { QUESTIONS } from "./questions.js";
import { scoreFor } from "./scoring.js";

const NICKNAME_MAX = 12;
const PLAYER_LOBBY_THROTTLE_MS = 1000;
const ANSWER_COUNT_THROTTLE_MS = 250;
const ANSWER_GRACE_MS = 500; // 網路延遲寬限：時限後 0.5 秒內送達的答案仍採計
const LEADERBOARD_SIZE = 5;
const FINAL_SIZE = 10;
const PODIUM_SIZE = 3;
const RESERVED_CLOSE_CODES = [1005, 1006, 1015];

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
      player_id TEXT PRIMARY KEY,
      nickname  TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      kicked    INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS answers (
      player_id      TEXT    NOT NULL,
      question_index INTEGER NOT NULL,
      choice         INTEGER NOT NULL,
      response_ms    INTEGER NOT NULL,
      correct        INTEGER NOT NULL,
      points         INTEGER NOT NULL,
      PRIMARY KEY (player_id, question_index)
    )`);
    // 客戶端每 20 秒送一次 "ping"，由執行環境直接回 "pong"：不會喚醒 DO、不計費。
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.playerLobbyTimer = null;
    this.answerCountTimer = null;
  }

  // ---------- SQLite 小工具 ----------
  getMeta(key) {
    const rows = this.sql.exec(`SELECT value FROM meta WHERE key = ?`, key).toArray();
    return rows.length ? rows[0].value : null;
  }

  numMeta(key) {
    return Number(this.getMeta(key));
  }

  setMeta(key, value) {
    this.sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, String(value));
  }

  listPlayers() {
    return this.sql
      .exec(`SELECT player_id, nickname FROM players WHERE kicked = 0 ORDER BY joined_at`)
      .toArray()
      .map((row) => ({ playerId: row.player_id, nickname: row.nickname }));
  }

  // 排名：總分 → 答對題數 → 答對題目的作答時間總和（越少越前面）→ 加入順序
  standings() {
    return this.sql
      .exec(`SELECT p.player_id, p.nickname,
          COALESCE(SUM(a.points), 0) AS score,
          COALESCE(SUM(a.correct), 0) AS correct_count,
          COALESCE(SUM(CASE WHEN a.correct = 1 THEN a.response_ms ELSE 0 END), 0) AS correct_ms
        FROM players p LEFT JOIN answers a ON a.player_id = p.player_id
        WHERE p.kicked = 0
        GROUP BY p.player_id
        ORDER BY score DESC, correct_count DESC, correct_ms ASC, p.joined_at ASC`)
      .toArray()
      .map((row, i) => ({
        rank: i + 1,
        playerId: row.player_id,
        nickname: row.nickname,
        score: row.score,
        correctCount: row.correct_count,
      }));
  }

  currentQuestion() {
    return QUESTIONS[this.numMeta("questionIndex")];
  }

  answeredCount(questionIndex) {
    return this.sql.exec(`SELECT COUNT(*) AS n FROM answers WHERE question_index = ?`, questionIndex).one().n;
  }

  // ---------- HTTP：建立房間、WebSocket 升級 ----------
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      if (this.getMeta("hostToken")) return new Response("房間已存在", { status: 409 });
      const hostToken = crypto.randomUUID();
      this.setMeta("roomCode", url.searchParams.get("code") ?? "");
      this.setMeta("hostToken", hostToken);
      this.setMeta("phase", "lobby");
      this.setMeta("questionIndex", -1);
      this.setMeta("createdAt", Date.now());
      return Response.json({ roomCode: this.getMeta("roomCode"), hostToken }, { status: 201 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, playerId: null });

    if (!this.getMeta("hostToken")) {
      // 房間不存在：先接受連線再送出清楚的錯誤訊息，前端才能顯示中文提示，而不是只看到連線失敗。
      this.send(server, { type: "error", code: "ROOM_NOT_FOUND", message: "找不到這個房間，請確認房間碼" });
      server.close(4404, "room not found");
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- WebSocket（Hibernation API） ----------
  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.send(ws, { type: "error", code: "BAD_JSON", message: "訊息格式錯誤" });
    }

    switch (msg?.type) {
      case "join":
        return this.handleJoin(ws, msg);
      case "answer":
        return this.handleAnswer(ws, msg);
      case "start":
      case "next":
      case "end_question":
        if (ws.deserializeAttachment()?.role !== "host") {
          return this.send(ws, { type: "error", code: "NOT_HOST", message: "只有主持人可以操作" });
        }
        if (msg.type === "start") return this.handleStart(ws);
        if (msg.type === "next") return this.handleNext(ws);
        return this.endQuestion();
      default:
        return this.send(ws, { type: "error", code: "UNKNOWN_TYPE", message: `不支援的訊息：${msg?.type}` });
    }
  }

  // 關閉中的連線在 close handler 執行當下仍會出現在 getWebSockets()，所以 socketsByRole 只算開啟中的連線。
  async webSocketClose(ws, code, reason) {
    // 1005／1006／1015 是「只能用來回報狀態」的保留代碼，不能拿來主動關閉；
    // 直接照抄回去會丟出 InvalidAccessError，後面的在線人數廣播就不會執行。
    try {
      ws.close(RESERVED_CLOSE_CODES.includes(code) ? 1000 : code, reason);
    } catch {
      // 連線可能已經關閉：忽略
    }
    const { role } = ws.deserializeAttachment() ?? {};
    if (role === "player") this.broadcastLobby(ws);
  }

  async webSocketError(ws) {
    const { role } = ws.deserializeAttachment() ?? {};
    if (role === "player") this.broadcastLobby(ws);
  }

  // DO alarm：題目時限到（含寬限）就結算。DO 可能已經休眠被移出記憶體，alarm 會重新喚醒它。
  async alarm() {
    if (this.getMeta("phase") !== "question") return;
    const deadline = this.numMeta("startedAt") + this.numMeta("timeLimit") * 1000 + ANSWER_GRACE_MS;
    if (Date.now() < deadline) {
      await this.ctx.storage.setAlarm(deadline);
      return;
    }
    await this.endQuestion();
  }

  // ---------- 加入 ----------
  handleJoin(ws, msg) {
    const serverNow = Date.now();
    const phase = this.getMeta("phase");
    const questionIndex = this.numMeta("questionIndex");

    if (msg.role === "host") {
      if (!msg.hostToken || msg.hostToken !== this.getMeta("hostToken")) {
        return this.send(ws, { type: "error", code: "BAD_HOST_TOKEN", message: "主持人驗證失敗" });
      }
      ws.serializeAttachment({ role: "host", playerId: null });
      // 題目本文與正解只傳給主持人（規格確認文件 T1）
      this.send(ws, {
        type: "joined",
        role: "host",
        roomCode: this.getMeta("roomCode"),
        serverNow,
        phase,
        questionIndex,
        totalQuestions: QUESTIONS.length,
        questions: QUESTIONS,
        question: phase === "question" ? this.questionPayload() : null,
      });
      this.sendLobbyToHosts();
      if (phase === "question") this.sendAnswerCount();
      if (phase === "result") this.send(ws, JSON.parse(this.getMeta("lastResult")));
      if (phase === "ended") this.sendFinalTo(ws, null);
      return;
    }

    if (msg.role !== "player") {
      return this.send(ws, { type: "error", code: "BAD_ROLE", message: "身分錯誤" });
    }

    // 帶著 playerId 回來（重新整理、斷線重連）→ 找回原本的玩家，不當成新玩家。
    let player = null;
    if (typeof msg.playerId === "string" && msg.playerId) {
      const rows = this.sql
        .exec(`SELECT player_id, nickname, kicked FROM players WHERE player_id = ?`, msg.playerId)
        .toArray();
      if (rows.length && rows[0].kicked) {
        this.send(ws, { type: "kicked" });
        return ws.close(4403, "kicked");
      }
      if (rows.length) player = { playerId: rows[0].player_id, nickname: rows[0].nickname };
    }

    if (!player) {
      const nickname = String(msg.nickname ?? "").trim().slice(0, NICKNAME_MAX);
      if (!nickname) {
        return this.send(ws, { type: "error", code: "BAD_NICKNAME", message: "請輸入 1–12 個字的暱稱" });
      }
      // 遊戲開始後也可以加入（使用者裁決：遲到可加入，漏掉的題目計 0 分）
      player = { playerId: crypto.randomUUID(), nickname: this.uniqueNickname(nickname) };
      this.sql.exec(
        `INSERT INTO players (player_id, nickname, joined_at) VALUES (?, ?, ?)`,
        player.playerId,
        player.nickname,
        serverNow,
      );
    }

    ws.serializeAttachment({ role: "player", playerId: player.playerId });
    const standing = this.standings().find((s) => s.playerId === player.playerId);
    this.send(ws, {
      type: "joined",
      role: "player",
      ...player,
      serverNow,
      phase,
      questionIndex,
      totalQuestions: QUESTIONS.length,
      totalScore: standing?.score ?? 0,
      rank: standing?.rank ?? null,
      question: phase === "question" ? this.questionPayload(player.playerId) : null,
    });
    if (phase === "result") this.sendPlayerResult(ws, player.playerId, questionIndex, this.standings());
    if (phase === "ended") this.sendFinalTo(ws, player.playerId);
    this.broadcastLobby();
  }

  uniqueNickname(nickname) {
    const taken = new Set(this.listPlayers().map((p) => p.nickname));
    if (!taken.has(nickname)) return nickname;
    for (let n = 2; ; n++) {
      const candidate = `${nickname.slice(0, NICKNAME_MAX - String(n).length - 1)}#${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // ---------- 遊戲流程 ----------
  async handleStart(ws) {
    if (this.getMeta("phase") !== "lobby") {
      return this.send(ws, { type: "error", code: "ALREADY_STARTED", message: "遊戲已經開始了" });
    }
    if (!QUESTIONS.length) return this.send(ws, { type: "error", code: "NO_QUESTIONS", message: "題庫是空的" });
    await this.startQuestion(0);
  }

  async handleNext(ws) {
    if (this.getMeta("phase") !== "result") {
      return this.send(ws, { type: "error", code: "NOT_IN_RESULT", message: "目前不在結算畫面" });
    }
    const next = this.numMeta("questionIndex") + 1;
    if (next < QUESTIONS.length) await this.startQuestion(next);
    else this.endGame();
  }

  // question_start 只帶「第幾題＋開始時間＋時限＋選項文字」，不帶題目本文（規格第 5 節、使用者裁決 C1）
  questionPayload(playerId = null) {
    const questionIndex = this.numMeta("questionIndex");
    const q = QUESTIONS[questionIndex];
    const payload = {
      questionIndex,
      totalQuestions: QUESTIONS.length,
      startedAt: this.numMeta("startedAt"),
      timeLimit: this.numMeta("timeLimit"),
      serverNow: Date.now(),
      choices: q.choices,
    };
    if (playerId) {
      payload.answered =
        this.sql
          .exec(`SELECT 1 FROM answers WHERE player_id = ? AND question_index = ?`, playerId, questionIndex)
          .toArray().length > 0;
    }
    return payload;
  }

  async startQuestion(index) {
    const q = QUESTIONS[index];
    const startedAt = Date.now();
    this.setMeta("phase", "question");
    this.setMeta("questionIndex", index);
    this.setMeta("startedAt", startedAt);
    this.setMeta("timeLimit", q.timeLimit);
    await this.ctx.storage.setAlarm(startedAt + q.timeLimit * 1000 + ANSWER_GRACE_MS);

    const payload = { type: "question_start", ...this.questionPayload() };
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1 && ws.deserializeAttachment()?.role) this.send(ws, payload);
    }
    this.sendAnswerCount();
  }

  async handleAnswer(ws, msg) {
    const { role, playerId } = ws.deserializeAttachment() ?? {};
    if (role !== "player") return this.send(ws, { type: "error", code: "NOT_PLAYER", message: "請先加入房間" });

    const now = Date.now();
    const questionIndex = this.numMeta("questionIndex");
    const reject = (reason) => this.send(ws, { type: "answer_ack", questionIndex: msg.questionIndex, accepted: false, reason });

    if (this.getMeta("phase") !== "question" || msg.questionIndex !== questionIndex) return reject("not_open");
    const q = QUESTIONS[questionIndex];
    const choice = msg.choice;
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return reject("bad_choice");

    const startedAt = this.numMeta("startedAt");
    const timeLimit = this.numMeta("timeLimit");
    if (now > startedAt + timeLimit * 1000 + ANSWER_GRACE_MS) return reject("late");

    // 伺服器計時、伺服器計分；只採計第一次作答（主鍵 + INSERT OR IGNORE）
    const responseMs = now - startedAt;
    const correct = choice === q.correct ? 1 : 0;
    const points = correct ? scoreFor(responseMs, timeLimit) : 0;
    const cursor = this.sql.exec(
      `INSERT OR IGNORE INTO answers (player_id, question_index, choice, response_ms, correct, points)
       VALUES (?, ?, ?, ?, ?, ?)`,
      playerId,
      questionIndex,
      choice,
      responseMs,
      correct,
      points,
    );
    const accepted = cursor.rowsWritten > 0;
    // 作答後不透露對錯，結算時才公布
    this.send(ws, { type: "answer_ack", questionIndex, accepted, reason: accepted ? undefined : "duplicate" });
    if (!accepted) return;

    this.scheduleAnswerCount();
    const online = this.onlinePlayerIds().size;
    if (online > 0 && this.answeredCount(questionIndex) >= online) await this.endQuestion();
  }

  async endQuestion() {
    if (this.getMeta("phase") !== "question") return;
    this.setMeta("phase", "result");
    await this.ctx.storage.deleteAlarm();
    clearTimeout(this.answerCountTimer);
    this.answerCountTimer = null;

    const questionIndex = this.numMeta("questionIndex");
    const q = QUESTIONS[questionIndex];
    const distribution = q.choices.map(() => 0);
    for (const row of this.sql
      .exec(`SELECT choice, COUNT(*) AS n FROM answers WHERE question_index = ? GROUP BY choice`, questionIndex)
      .toArray()) {
      distribution[row.choice] = row.n;
    }
    const standings = this.standings();
    const payload = {
      type: "question_end",
      questionIndex,
      totalQuestions: QUESTIONS.length,
      correctChoice: q.correct,
      distribution,
      answered: distribution.reduce((a, b) => a + b, 0),
      playerCount: standings.length,
      leaderboard: standings.slice(0, LEADERBOARD_SIZE).map(({ rank, nickname, score }) => ({ rank, nickname, score })),
      isLast: questionIndex === QUESTIONS.length - 1,
    };
    this.setMeta("lastResult", JSON.stringify(payload));

    // 全場廣播只在題目結束時做一次；每位玩家另外收到自己的結果
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue;
      const { role, playerId } = ws.deserializeAttachment() ?? {};
      if (!role) continue;
      this.send(ws, payload);
      if (role === "player") this.sendPlayerResult(ws, playerId, questionIndex, standings);
    }
  }

  sendPlayerResult(ws, playerId, questionIndex, standings) {
    const standing = standings.find((s) => s.playerId === playerId);
    const rows = this.sql
      .exec(`SELECT correct, points FROM answers WHERE player_id = ? AND question_index = ?`, playerId, questionIndex)
      .toArray();
    this.send(ws, {
      type: "your_result",
      questionIndex,
      answered: rows.length > 0,
      correct: rows.length > 0 && rows[0].correct === 1,
      points: rows.length ? rows[0].points : 0,
      totalScore: standing?.score ?? 0,
      rank: standing?.rank ?? null,
      playerCount: standings.length,
    });
  }

  endGame() {
    this.setMeta("phase", "ended");
    const standings = this.standings();
    // 前 3 名的 4 位數驗證碼：上台時主持人核對手機畫面，避免冒名（使用者裁決 C3）
    const podium = standings.slice(0, PODIUM_SIZE).map(({ rank, playerId, nickname, score }) => ({
      rank,
      playerId,
      nickname,
      score,
      verifyCode: String(Math.floor(1000 + Math.random() * 9000)),
    }));
    this.setMeta("final", JSON.stringify({ podium }));
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue;
      const { role, playerId } = ws.deserializeAttachment() ?? {};
      if (role) this.sendFinalTo(ws, role === "player" ? playerId : null);
    }
  }

  sendFinalTo(ws, playerId) {
    const standings = this.standings();
    const { podium } = JSON.parse(this.getMeta("final") ?? '{"podium":[]}');
    const base = {
      type: "game_end",
      playerCount: standings.length,
      finalLeaderboard: standings
        .slice(0, FINAL_SIZE)
        .map(({ rank, nickname, score, correctCount }) => ({ rank, nickname, score, correctCount })),
    };
    if (!playerId) {
      // 主持人另外拿到前 3 名的驗證碼，用來核對上台者的手機
      this.send(ws, { ...base, podium: podium.map(({ rank, nickname, score, verifyCode }) => ({ rank, nickname, score, verifyCode })) });
      return;
    }
    const standing = standings.find((s) => s.playerId === playerId);
    const mine = podium.find((p) => p.playerId === playerId);
    this.send(ws, {
      ...base,
      you: { rank: standing?.rank ?? null, totalScore: standing?.score ?? 0, verifyCode: mine?.verifyCode ?? null },
    });
  }

  // ---------- 主持人即時資訊 ----------
  // 已作答人數只送給主持人，不廣播給全場（規格第 5 節第 3 條）；最多每 250ms 一次
  scheduleAnswerCount() {
    if (this.answerCountTimer) return;
    this.answerCountTimer = setTimeout(() => {
      this.answerCountTimer = null;
      this.sendAnswerCount();
    }, ANSWER_COUNT_THROTTLE_MS);
  }

  sendAnswerCount() {
    if (this.getMeta("phase") !== "question") return;
    const questionIndex = this.numMeta("questionIndex");
    const payload = {
      type: "answer_count",
      questionIndex,
      answered: this.answeredCount(questionIndex),
      total: this.onlinePlayerIds().size,
    };
    for (const ws of this.socketsByRole("host")) this.send(ws, payload);
  }

  // ---------- 等待室廣播（規格確認文件 T4） ----------
  // 完整名單只給主持人（立即）；玩家只收到人數，而且最多每秒一次，避免 150 人加入時產生上萬則廣播。
  broadcastLobby(closingWs = null) {
    this.sendLobbyToHosts(closingWs);
    if (this.playerLobbyTimer) return;
    this.playerLobbyTimer = setTimeout(() => {
      this.playerLobbyTimer = null;
      const playerCount = this.listPlayers().length;
      for (const ws of this.socketsByRole("player")) this.send(ws, { type: "lobby_update", playerCount });
    }, PLAYER_LOBBY_THROTTLE_MS);
  }

  sendLobbyToHosts(closingWs = null) {
    const players = this.listPlayers();
    const online = this.onlinePlayerIds(closingWs);
    const payload = {
      type: "lobby_update",
      playerCount: players.length,
      onlineCount: online.size,
      players: players.map((p) => ({ ...p, online: online.has(p.playerId) })),
    };
    for (const ws of this.socketsByRole("host")) this.send(ws, payload);
  }

  onlinePlayerIds(closingWs = null) {
    return new Set(
      this.socketsByRole("player")
        .filter((ws) => ws !== closingWs)
        .map((ws) => ws.deserializeAttachment().playerId),
    );
  }

  // 只算「開啟中」（readyState 1）的連線：close handler 一開始就呼叫 ws.close()，
  // 關閉中的連線會變成 2／3，不再被算成在線；也不會對它送訊息。
  socketsByRole(role) {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === 1 && ws.deserializeAttachment()?.role === role);
  }

  send(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // 連線已經關閉：忽略，重連時會重新取得狀態。
    }
  }
}
