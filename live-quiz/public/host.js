import { connectRoom } from "/shared/ws-client.js";
import { syncClock, remainingMs } from "/shared/time-sync.js";
import { CHOICE_STYLES } from "/shared/choices.js";
// QR code 在瀏覽器裡直接產生，不呼叫任何外部 API（qrcode-generator，MIT 授權，檔案放在 public/shared/）
import qrcode from "/shared/qrcode.mjs";

const HOST_KEY = "liveQuiz.host";
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

function show(section) {
  for (const id of SECTIONS) $(id).hidden = id !== section;
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

  const seen = new Set();
  for (const p of msg.players) {
    seen.add(p.playerId);
    let item = nameItems.get(p.playerId);
    if (!item) {
      item = el("li", "", p.nickname);
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

  $("r-leaderboard").replaceChildren(
    ...r.leaderboard.map((p) => {
      const item = el("li");
      const before = prevRanks.get(p.nickname);
      const moved = before ? before - p.rank : 0;
      const move = el("span", "lb-move", before === undefined && r.questionIndex > 0 ? "新進榜" : moved > 0 ? `▲ ${moved}` : "");
      const score = el("span", "lb-score", String(prevScores.get(p.nickname) ?? 0));
      item.append(el("span", "rank-badge", String(p.rank)), el("span", "lb-name", p.nickname), move, score);
      countUp(score, prevScores.get(p.nickname) ?? 0, p.score);
      return item;
    }),
  );
  prevRanks = new Map(r.leaderboard.map((p) => [p.nickname, p.rank]));
  prevScores = new Map(r.leaderboard.map((p) => [p.nickname, p.score]));

  $("next").textContent = r.isLast ? "看最終排名" : "下一題";
  show("result");
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
        case "error":
          $("status").textContent = msg.message;
          if (msg.code === "ROOM_NOT_FOUND" || msg.code === "BAD_HOST_TOKEN") {
            localStorage.removeItem(HOST_KEY);
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
    const res = await fetch("/api/rooms", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "建立房間失敗");
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

const saved = loadHost();
if (saved?.roomCode && saved?.hostToken) enterRoom(saved);
else show("setup");
