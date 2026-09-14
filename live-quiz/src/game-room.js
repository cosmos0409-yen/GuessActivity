// 一場遊戲 = 一個 Durable Object（SQLite backend）。
//
// 為什麼玩家一加入就寫 SQLite（規格確認文件 T2）：
//   使用 WebSocket Hibernation API 時，DO 閒置約 10 秒會休眠、之後可能被移出記憶體，
//   記憶體裡的變數會全部消失。所以名單與房間資訊一律以 SQLite 為準，醒來時從 SQLite 讀回。
//   每條 WebSocket 的身分（host／playerId）用 serializeAttachment 記在連線上，同樣能撐過休眠。
import { DurableObject } from "cloudflare:workers";

const NICKNAME_MAX = 12;
const PLAYER_LOBBY_THROTTLE_MS = 1000;

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
    // 客戶端每 20 秒送一次 "ping"，由執行環境直接回 "pong"：不會喚醒 DO、不計費。
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.playerLobbyTimer = null;
  }

  // ---------- SQLite 小工具 ----------
  getMeta(key) {
    const rows = this.sql.exec(`SELECT value FROM meta WHERE key = ?`, key).toArray();
    return rows.length ? rows[0].value : null;
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

  // ---------- HTTP：建立房間、WebSocket 升級 ----------
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      if (this.getMeta("hostToken")) return new Response("房間已存在", { status: 409 });
      const hostToken = crypto.randomUUID();
      this.setMeta("roomCode", url.searchParams.get("code") ?? "");
      this.setMeta("hostToken", hostToken);
      this.setMeta("phase", "lobby");
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
      default:
        return this.send(ws, { type: "error", code: "UNKNOWN_TYPE", message: `不支援的訊息：${msg?.type}` });
    }
  }

  // 關閉中的連線在 close handler 執行當下仍會出現在 getWebSockets()，
  // 所以廣播時要把它排除，主持人看到的「在線人數」才會正確減少。
  async webSocketClose(ws, code, reason) {
    // 1005／1006／1015 是「只能用來回報狀態」的保留代碼，不能拿來主動關閉；
    // 直接照抄回去會丟出 InvalidAccessError，後面的在線人數廣播就不會執行。
    const RESERVED_CLOSE_CODES = [1005, 1006, 1015];
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

  handleJoin(ws, msg) {
    const serverNow = Date.now();
    const phase = this.getMeta("phase");

    if (msg.role === "host") {
      if (!msg.hostToken || msg.hostToken !== this.getMeta("hostToken")) {
        return this.send(ws, { type: "error", code: "BAD_HOST_TOKEN", message: "主持人驗證失敗" });
      }
      ws.serializeAttachment({ role: "host", playerId: null });
      this.send(ws, { type: "joined", role: "host", roomCode: this.getMeta("roomCode"), serverNow, phase });
      return this.sendLobbyToHosts();
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
      player = { playerId: crypto.randomUUID(), nickname: this.uniqueNickname(nickname) };
      this.sql.exec(
        `INSERT INTO players (player_id, nickname, joined_at) VALUES (?, ?, ?)`,
        player.playerId,
        player.nickname,
        serverNow,
      );
    }

    ws.serializeAttachment({ role: "player", playerId: player.playerId });
    this.send(ws, { type: "joined", role: "player", ...player, serverNow, phase });
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
    const online = new Set(
      this.socketsByRole("player")
        .filter((ws) => ws !== closingWs)
        .map((ws) => ws.deserializeAttachment().playerId),
    );
    const payload = {
      type: "lobby_update",
      playerCount: players.length,
      onlineCount: online.size,
      players: players.map((p) => ({ ...p, online: online.has(p.playerId) })),
    };
    for (const ws of this.socketsByRole("host")) this.send(ws, payload);
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
