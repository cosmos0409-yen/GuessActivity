import { connectRoom } from "/shared/ws-client.js";
import { syncClock, remainingMs } from "/shared/time-sync.js";
import { CHOICE_STYLES } from "/shared/choices.js";
// QR code 在瀏覽器裡直接產生，不呼叫任何外部 API（qrcode-generator，MIT 授權，檔案放在 public/shared/）
import qrcode from "/shared/qrcode.mjs";
import { parseQuestionCsv } from "/shared/question-csv.js";

const HOST_KEY = "liveQuiz.host";
// 題庫設定：選哪一種、試算表網址；另外存一份最後一次讀成功的 CSV，現場讀不到試算表時拿來用
const BANK_KEY = "liveQuiz.bank";
const BANK_CACHE_KEY = "liveQuiz.bankCache";
const SHEET_TIMEOUT_MS = 8000;
const URGENT_MS = 5000;
const $ = (id) => document.getElementById(id);
const SECTIONS = ["setup", "lobby", "question", "result", "final"];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let conn = null;
let questions = [];
let totalQuestions = 0;
let timerFrame = null;
let lastPlayerCount = 0;
const nameItems = new Map(); // playerId → <li>，暱稱牆只新增／更新，不整片重畫（新名字才會有彈出動畫）
let prevRanks = new Map(); // 暱稱 → 上一題的名次，用來顯示「▲ 上升」
let prevScores = new Map(); // 暱稱 → 上一題的分數，用來做分數跳動動畫
let currentRoom = null; // { roomCode, hostToken }
let playersList = []; // 最新的完整名單（lobby_update），玩家名單對話框用
let pendingKick = null; // 等待確認要移出的玩家 { playerId, nickname }
let flashTimer = null;
let sheetQuestions = null; // 最近一次從試算表讀到、通過檢查的題目

function show(section) {
  for (const id of SECTIONS) $(id).hidden = id !== section;
  const inRoom = section !== "setup";
  $("manage").hidden = !inRoom || section === "final";
  $("takeover").hidden = !inRoom;
}

// 短暫提示（例如「已移出 OOO」），3 秒後自動消失
function flash(text) {
  clearTimeout(flashTimer);
  $("status").textContent = text;
  flashTimer = setTimeout(() => {
    if ($("status").textContent === text) $("status").textContent = "";
  }, 3000);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderJoinQr(url) {
  const qr = qrcode(0, "M"); // 0 = 依內容長度自動選版本；M = 約 15% 容錯，投影反光時也掃得到
  qr.addData(url);
  qr.make();
  $("qr").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

// 主持人重新整理頁面時，用存在 localStorage 的 roomCode + hostToken 回到同一個房間。
function loadHost() {
  try {
    return JSON.parse(localStorage.getItem(HOST_KEY) || "null");
  } catch {
    return null;
  }
}

function saveHost(host) {
  try {
    localStorage.setItem(HOST_KEY, JSON.stringify(host));
  } catch {
    /* 私密瀏覽模式存不進去也沒關係，只是重新整理後要重開房間 */
  }
}

function forgetHost() {
  try {
    localStorage.removeItem(HOST_KEY);
  } catch {
    /* 忽略 */
  }
}

// 備援電腦接手：開啟「host.html#takeover=房間碼.主持人驗證碼」就會存進這台電腦並進入房間。
// 驗證碼只放在網址的 # 後面（瀏覽器不會把 # 之後送到伺服器），讀完立刻從網址列清掉，避免投影出來。
function readTakeoverHash() {
  const match = /^#takeover=(\d{6})\.([0-9a-f-]{36})$/i.exec(location.hash);
  if (!match) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return { roomCode: match[1], hostToken: match[2] };
}

// ---------- 題庫（建立房間前） ----------
function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存不進去就只是下次要重新讀取 */
  }
}

function bankMode() {
  return document.querySelector('input[name="bank"]:checked').value;
}

function setBankStatus(text, kind = "") {
  $("bank-status").textContent = text;
  $("bank-status").className = `small ${kind}`;
}

function saveBankSettings() {
  writeJson(BANK_KEY, { mode: bankMode(), url: $("sheet-url").value.trim() });
}

// 讀取試算表：先試網路（8 秒逾時）；失敗就用這台電腦上次存下的同一個網址的內容。
// 預覽只列題目與秒數，不列正解（這個畫面可能已經投影出來）。
async function loadSheet() {
  const url = $("sheet-url").value.trim();
  sheetQuestions = null;
  $("bank-warnings").replaceChildren();
  $("bank-preview").replaceChildren();
  if (!/^https:\/\//i.test(url)) {
    setBankStatus("請貼上 https:// 開頭的 CSV 網址", "bad");
    return null;
  }
  saveBankSettings();
  setBankStatus("讀取中…");
  $("load-sheet").disabled = true;

  let csv = null;
  let note = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csv = await res.text();
    if (/^\s*<!doctype html|^\s*<html/i.test(csv)) throw new Error("拿到的是網頁，不是 CSV（發布格式要選「逗號分隔值檔案」）");
    writeJson(BANK_CACHE_KEY, { url, csv, fetchedAt: Date.now() });
  } catch (err) {
    const cache = readJson(BANK_CACHE_KEY);
    if (cache?.url === url && cache.csv) {
      csv = cache.csv;
      note = `（讀不到試算表：${err.name === "AbortError" ? "逾時" : err.message}；改用這台電腦 ${new Date(cache.fetchedAt).toLocaleString("zh-TW")} 存下的版本）`;
    } else {
      setBankStatus(`讀不到試算表：${err.name === "AbortError" ? "超過 8 秒沒有回應" : err.message}`, "bad");
      return null;
    }
  } finally {
    clearTimeout(timer);
    $("load-sheet").disabled = false;
  }

  const { questions, warnings } = parseQuestionCsv(csv);
  $("bank-warnings").replaceChildren(
    ...warnings.map((w) => el("li", "", w.row ? `第 ${w.row} 列：${w.reason}` : w.reason)),
  );
  $("bank-preview").replaceChildren(
    ...questions.map((q) => {
      const item = el("li", "", q.text);
      item.append(el("span", "meta", `${q.choices.length} 選 1・${q.timeLimit} 秒${q.image ? "・有圖片" : ""}`));
      return item;
    }),
  );
  if (!questions.length) {
    setBankStatus(`沒有可以出的題目${note}`, "bad");
    return null;
  }
  sheetQuestions = questions;
  const skipped = warnings.filter((w) => w.row > 1).length;
  setBankStatus(
    `讀到 ${questions.length} 題${skipped ? `，跳過 ${skipped} 列（原因見下方）` : ""}${note}`,
    note || warnings.length ? "warn" : "ok",
  );
  return questions;
}

function updateBankUi() {
  $("sheet-box").hidden = bankMode() !== "sheet";
  saveBankSettings();
}

function tile(i, text) {
  const item = el("li", `tile ${CHOICE_STYLES[i].className}`);
  item.append(el("span", "shape", CHOICE_STYLES[i].shape), el("span", "tile-text", text));
  return item;
}

function countUp(node, from, to) {
  if (reducedMotion || from === to) {
    node.textContent = to;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    node.textContent = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- 等待室 ----------
function renderLobby(msg) {
  $("player-count").textContent = msg.playerCount;
  $("online-count").textContent = msg.onlineCount ?? msg.playerCount;
  $("q-online").textContent = msg.onlineCount ?? msg.playerCount;
  $("top-count").textContent = `${msg.playerCount} 人`;
  $("top-count").hidden = false;
  if (msg.playerCount > lastPlayerCount) {
    const num = $("player-count");
    num.classList.remove("bump");
    void num.offsetWidth; // 重新觸發動畫
    num.classList.add("bump");
  }
  lastPlayerCount = msg.playerCount;

  playersList = msg.players;
  const seen = new Set();
  for (const p of msg.players) {
    seen.add(p.playerId);
    let item = nameItems.get(p.playerId);
    if (!item) {
      item = el("li", "", p.nickname);
      item.dataset.playerId = p.playerId;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      nameItems.set(p.playerId, item);
      $("players").append(item);
    }
    item.classList.toggle("offline", !p.online);
  }
  for (const [id, item] of nameItems) {
    if (!seen.has(id)) {
      item.remove();
      nameItems.delete(id);
    }
  }
  if ($("players-dialog").open) renderPlayersDialog();
}

// ---------- 踢人 ----------
function askKick(playerId) {
  const player = playersList.find((p) => p.playerId === playerId);
  if (!player) return;
  pendingKick = player;
  $("kick-name").textContent = player.nickname;
  $("kick-dialog").showModal();
  $("kick-cancel").focus(); // 預設焦點放在「取消」，避免誤按 Enter 就踢人
}

function renderPlayersDialog() {
  const keyword = $("pd-filter").value.trim();
  const list = keyword ? playersList.filter((p) => p.nickname.includes(keyword)) : playersList;
  $("pd-count").textContent = playersList.length;
  $("pd-list").replaceChildren(
    ...(list.length
      ? list.map((p) => {
          const item = el("li", p.online ? "" : "offline");
          const btn = el("button", "btn btn-danger", "移出");
          btn.type = "button";
          btn.addEventListener("click", () => askKick(p.playerId));
          item.append(el("span", "pd-name", p.nickname + (p.online ? "" : "（離線）")), btn);
          return item;
        })
      : [el("li", "pd-empty", keyword ? "沒有符合的暱稱" : "還沒有人加入")]),
  );
}

// ---------- 出題 ----------
function renderProgress(index) {
  $("q-progress").replaceChildren(
    ...Array.from({ length: totalQuestions }, (_, i) =>
      el("li", i < index ? "done" : i === index ? "current" : ""),
    ),
  );
}

function startTimer(startedAt, timeLimit) {
  cancelAnimationFrame(timerFrame);
  const ring = $("timer");
  const tick = () => {
    const left = remainingMs(startedAt, timeLimit);
    $("q-seconds").textContent = Math.ceil(left / 1000);
    ring.style.setProperty("--p", String(left / (timeLimit * 1000)));
    ring.classList.toggle("urgent", left > 0 && left <= URGENT_MS);
    if (left > 0) timerFrame = requestAnimationFrame(tick);
  };
  tick();
}

function renderAnswerCount(answered, total) {
  $("q-answered").textContent = answered;
  $("q-online").textContent = total;
  $("answer-bar").style.width = `${total ? Math.min(100, (answered / total) * 100) : 0}%`;
}

function renderQuestion(q) {
  syncClock(q.serverNow);
  totalQuestions = q.totalQuestions;
  const question = questions[q.questionIndex];
  $("q-number").textContent = `${q.questionIndex + 1}／${q.totalQuestions}`;
  $("q-text").textContent = question.text;
  $("q-image").hidden = !question.image;
  if (question.image) $("q-image").src = question.image;
  renderAnswerCount(0, Number($("q-online").textContent) || 0);
  renderProgress(q.questionIndex);
  $("q-choices").replaceChildren(...question.choices.map((text, i) => tile(i, text)));
  show("question");
  startTimer(q.startedAt, q.timeLimit);
}

// ---------- 答案揭曉 ----------
function renderResult(r) {
  cancelAnimationFrame(timerFrame);
  const question = questions[r.questionIndex];
  $("r-number").textContent = r.questionIndex + 1;
  $("r-text").textContent = question.text;
  const total = Math.max(1, r.answered);
  const fills = [];
  $("r-dist").replaceChildren(
    ...question.choices.map((text, i) => {
      const item = tile(i, text);
      const isCorrect = i === r.correctChoice;
      item.classList.add(isCorrect ? "correct" : "dim");
      const fill = el("span", "tile-fill");
      item.prepend(fill);
      fills.push([fill, (r.distribution[i] / total) * 100]);
      if (isCorrect) item.append(el("span", "tile-check", "✓ 正確答案"));
      item.append(el("span", "tile-count", `${r.distribution[i]} 人`));
      return item;
    }),
  );
  // 先畫出 0 寬度，下一個 frame 再設定目標寬度，長條才會「長出來」
  requestAnimationFrame(() => requestAnimationFrame(() => fills.forEach(([f, pct]) => (f.style.width = `${pct}%`))));

  // restored：主持人斷線後回來補送的結果，沒有「上一題」可以比較，不顯示名次變化與分數動畫
  renderLeaderboard(r.leaderboard, { showMoves: !r.restored && r.questionIndex > 0, animate: !r.restored });

  $("next").textContent = r.isLast ? "看最終排名" : "下一題";
  show("result");
}

function renderLeaderboard(leaderboard, { showMoves, animate }) {
  $("r-leaderboard").replaceChildren(
    ...leaderboard.map((p) => {
      const item = el("li");
      const before = prevRanks.get(p.nickname);
      const moved = before ? before - p.rank : 0;
      const label = !showMoves ? "" : before === undefined ? "新進榜" : moved > 0 ? `▲ ${moved}` : "";
      const from = animate ? (prevScores.get(p.nickname) ?? 0) : p.score;
      const score = el("span", "lb-score", String(from));
      item.append(el("span", "rank-badge", String(p.rank)), el("span", "lb-name", p.nickname), el("span", "lb-move", label), score);
      countUp(score, from, p.score);
      return item;
    }),
  );
  prevRanks = new Map(leaderboard.map((p) => [p.nickname, p.rank]));
  prevScores = new Map(leaderboard.map((p) => [p.nickname, p.score]));
}

// ---------- 最終排名 ----------
function renderFinal(g) {
  cancelAnimationFrame(timerFrame);
  const podium = g.podium ?? [];
  // 頒獎台排列：第 2 名在左、第 1 名在中、第 3 名在右
  const order = [2, 1, 3].map((rank) => podium.find((p) => p.rank === rank)).filter(Boolean);
  $("podium").replaceChildren(
    ...order.map((p) => {
      const col = el("div", `podium-col place-${p.rank}`);
      if (p.rank === 1) col.append(el("span", "crown", "👑"));
      col.append(
        el("span", "podium-name", p.nickname),
        el("span", "podium-score", `${p.score} 分`),
        el("span", "podium-code", `驗證碼 ${p.verifyCode}`),
        el("div", "podium-block", String(p.rank)),
      );
      return col;
    }),
  );
  $("final-list").replaceChildren(
    ...g.finalLeaderboard.slice(3).map((p) => el("li", "", `${p.rank}. ${p.nickname}　${p.score} 分（答對 ${p.correctCount} 題）`)),
  );
  show("final");
  if (!reducedMotion) launchConfetti();
}

function launchConfetti() {
  const colors = ["var(--gold)", "var(--c0)", "var(--c1)", "var(--c3)", "var(--cream)"];
  const box = $("confetti");
  box.replaceChildren(
    ...Array.from({ length: 80 }, (_, i) => {
      const piece = el("i");
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = `${3 + Math.random() * 3}s`;
      piece.style.animationDelay = `${2.3 + Math.random() * 1.5}s`; // 第 1 名升起後才開始撒
      return piece;
    }),
  );
}

// ---------- 連線 ----------
function enterRoom({ roomCode, hostToken }) {
  currentRoom = { roomCode, hostToken };
  $("room-code").textContent = roomCode;
  $("top-room").textContent = `房間 ${roomCode}`;
  $("top-room").hidden = false;
  const joinUrl = `${location.origin}/play.html?room=${roomCode}`;
  $("join-url").textContent = joinUrl;
  renderJoinQr(joinUrl);
  show("lobby");

  conn = connectRoom(roomCode, {
    onOpen: () => conn.send({ type: "join", role: "host", roomCode, hostToken }),
    onStatus: (s) => {
      $("status").textContent = { connecting: "連線中…", open: "", reconnecting: "連線中斷，重新連線中…", closed: "已中斷連線" }[s] ?? "";
    },
    onMessage: (msg) => {
      switch (msg.type) {
        case "joined":
          syncClock(msg.serverNow);
          questions = msg.questions;
          totalQuestions = msg.totalQuestions;
          if (msg.phase === "lobby") show("lobby");
          if (msg.phase === "question" && msg.question) renderQuestion(msg.question);
          break;
        case "lobby_update":
          renderLobby(msg);
          break;
        case "question_start":
          renderQuestion(msg);
          break;
        case "answer_count":
          renderAnswerCount(msg.answered, msg.total);
          break;
        case "question_end":
          renderResult(msg);
          break;
        case "game_end":
          renderFinal(msg);
          break;
        case "kick_done":
          flash(`已移出「${msg.nickname}」`);
          break;
        case "leaderboard_update":
          // 答案揭曉畫面移出玩家後，前 5 名直接換成新名單（不重播動畫）
          renderLeaderboard(msg.leaderboard, { showMoves: false, animate: false });
          break;
        case "error":
          flash(msg.message);
          if (msg.code === "ROOM_NOT_FOUND" || msg.code === "BAD_HOST_TOKEN") {
            forgetHost();
            conn?.close();
            conn = null;
            currentRoom = null;
            $("create").disabled = false;
            show("setup");
          }
          break;
      }
    },
  });
}

$("create").addEventListener("click", async () => {
  $("create").disabled = true;
  $("setup-error").textContent = "";
  try {
    let body;
    if (bankMode() === "sheet") {
      // 還沒按「讀取」就直接建立房間：先讀一次；讀不到就不建立，避免主持人以為用的是試算表題庫
      const questions = sheetQuestions ?? (await loadSheet());
      if (!questions) throw new Error("試算表題庫還沒讀好，請先確認上方的訊息");
      body = JSON.stringify({ questions });
    }
    const res = await fetch("/api/rooms", { method: "POST", body, headers: body ? { "content-type": "application/json" } : {} });
    const data = await res.json();
    if (!res.ok) throw new Error([data.error || "建立房間失敗", ...(data.errors ?? [])].join("\n"));
    saveHost(data);
    enterRoom(data);
  } catch (err) {
    $("setup-error").textContent = err.message;
    $("create").disabled = false;
  }
});

$("start").addEventListener("click", () => conn?.send({ type: "start" }));
$("next").addEventListener("click", () => conn?.send({ type: "next" }));
$("end-question").addEventListener("click", () => conn?.send({ type: "end_question" }));

// 暱稱牆：點名字（或聚焦後按 Enter）→ 確認後移出
$("players").addEventListener("click", (event) => {
  const item = event.target.closest("li[data-player-id]");
  if (item) askKick(item.dataset.playerId);
});
$("players").addEventListener("keydown", (event) => {
  const item = event.target.closest("li[data-player-id]");
  if (item && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    askKick(item.dataset.playerId);
  }
});
$("kick-cancel").addEventListener("click", () => $("kick-dialog").close());
$("kick-confirm").addEventListener("click", () => {
  if (pendingKick) conn?.send({ type: "kick", playerId: pendingKick.playerId });
  pendingKick = null;
  $("kick-dialog").close();
});

$("manage").addEventListener("click", () => {
  $("pd-filter").value = "";
  renderPlayersDialog();
  $("players-dialog").showModal();
});
$("pd-filter").addEventListener("input", renderPlayersDialog);
$("pd-close").addEventListener("click", () => $("players-dialog").close());

// 接手連結只複製到剪貼簿、不顯示在畫面上（主持人畫面會投影，驗證碼不能讓觀眾看到）
$("takeover").addEventListener("click", async () => {
  if (!currentRoom) return;
  const link = `${location.origin}${location.pathname}#takeover=${currentRoom.roomCode}.${currentRoom.hostToken}`;
  try {
    await navigator.clipboard.writeText(link);
    flash("已複製接手連結：在備援電腦開啟就能接手這個房間（不要貼到公開的地方）");
  } catch {
    flash("無法複製（瀏覽器不允許存取剪貼簿）");
  }
});

$("new-room").addEventListener("click", () => {
  if (!confirm("要結束這個房間、建立新的房間嗎？")) return;
  forgetHost();
  conn?.close();
  conn = null;
  currentRoom = null;
  nameItems.clear();
  $("players").replaceChildren();
  playersList = [];
  lastPlayerCount = 0;
  prevRanks = new Map();
  prevScores = new Map();
  $("create").disabled = false;
  $("top-room").hidden = true;
  $("top-count").hidden = true;
  $("confetti").replaceChildren();
  show("setup");
});

for (const radio of document.querySelectorAll('input[name="bank"]')) radio.addEventListener("change", updateBankUi);
$("load-sheet").addEventListener("click", loadSheet);
$("sheet-url").addEventListener("change", () => {
  sheetQuestions = null;
  saveBankSettings();
});
const bankSettings = readJson(BANK_KEY);
if (bankSettings?.url) $("sheet-url").value = bankSettings.url;
if (bankSettings?.mode === "sheet") document.querySelector('input[name="bank"][value="sheet"]').checked = true;
$("sheet-box").hidden = bankMode() !== "sheet";

const takeover = readTakeoverHash();
if (takeover) saveHost(takeover);
const saved = takeover ?? loadHost();
if (saved?.roomCode && saved?.hostToken) enterRoom(saved);
else show("setup");
