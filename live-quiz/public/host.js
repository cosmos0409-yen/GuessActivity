import { connectRoom } from "/shared/ws-client.js";
import { syncClock, remainingMs } from "/shared/time-sync.js";
import { CHOICE_STYLES } from "/shared/choices.js";
// QR code 在瀏覽器裡直接產生，不呼叫任何外部 API（qrcode-generator，MIT 授權，檔案放在 public/shared/）
import qrcode from "/shared/qrcode.mjs";

const HOST_KEY = "liveQuiz.host";
const $ = (id) => document.getElementById(id);
const SECTIONS = ["setup", "lobby", "question", "result", "final"];

let conn = null;
let questions = [];
let timerFrame = null;

function show(section) {
  for (const id of SECTIONS) $(id).hidden = id !== section;
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

function li(text, className) {
  const el = document.createElement("li");
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function choiceLabel(i, text) {
  const style = CHOICE_STYLES[i];
  return `${style.shape} ${text}`;
}

// ---------- 出題 ----------
function startTimer(startedAt, timeLimit) {
  cancelAnimationFrame(timerFrame);
  const tick = () => {
    const left = remainingMs(startedAt, timeLimit);
    $("q-seconds").textContent = Math.ceil(left / 1000);
    $("q-bar").style.width = `${(left / (timeLimit * 1000)) * 100}%`;
    if (left > 0) timerFrame = requestAnimationFrame(tick);
  };
  tick();
}

function renderQuestion(q) {
  syncClock(q.serverNow);
  const question = questions[q.questionIndex];
  $("q-number").textContent = q.questionIndex + 1;
  $("q-total").textContent = q.totalQuestions;
  $("q-text").textContent = question.text;
  $("q-answered").textContent = "0";
  $("q-choices").replaceChildren(
    ...question.choices.map((text, i) => li(choiceLabel(i, text), `choice ${CHOICE_STYLES[i].className}`)),
  );
  show("question");
  startTimer(q.startedAt, q.timeLimit);
}

function renderResult(r) {
  cancelAnimationFrame(timerFrame);
  const question = questions[r.questionIndex];
  $("r-number").textContent = r.questionIndex + 1;
  $("r-text").textContent = question.text;
  const max = Math.max(1, ...r.distribution);
  $("r-dist").replaceChildren(
    ...question.choices.map((text, i) => {
      const item = li("", `dist-row ${CHOICE_STYLES[i].className}${i === r.correctChoice ? " correct" : ""}`);
      const label = document.createElement("span");
      label.className = "dist-label";
      label.textContent = `${choiceLabel(i, text)}${i === r.correctChoice ? "　✓ 正確答案" : ""}`;
      const bar = document.createElement("span");
      bar.className = "dist-bar";
      bar.style.width = `${(r.distribution[i] / max) * 100}%`;
      const count = document.createElement("span");
      count.className = "dist-count";
      count.textContent = `${r.distribution[i]} 人`;
      item.append(label, bar, count);
      return item;
    }),
  );
  $("r-leaderboard").replaceChildren(...r.leaderboard.map((p) => li(`${p.rank}. ${p.nickname}　${p.score} 分`)));
  $("next").textContent = r.isLast ? "看最終排名" : "下一題";
  show("result");
}

function renderFinal(g) {
  cancelAnimationFrame(timerFrame);
  $("podium").replaceChildren(
    ...(g.podium ?? []).map((p) => li(`第 ${p.rank} 名　${p.nickname}　${p.score} 分　驗證碼 ${p.verifyCode}`, "podium-item")),
  );
  $("final-list").replaceChildren(...g.finalLeaderboard.map((p) => li(`${p.rank}. ${p.nickname}　${p.score} 分（答對 ${p.correctCount} 題）`)));
  show("final");
}

// ---------- 連線 ----------
function enterRoom({ roomCode, hostToken }) {
  $("room-code").textContent = roomCode;
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
          if (msg.phase === "lobby") show("lobby");
          if (msg.phase === "question" && msg.question) renderQuestion(msg.question);
          break;
        case "lobby_update":
          $("player-count").textContent = msg.playerCount;
          $("online-count").textContent = msg.onlineCount ?? msg.playerCount;
          $("q-online").textContent = msg.onlineCount ?? msg.playerCount;
          $("players").replaceChildren(...msg.players.map((p) => li(p.nickname, p.online ? "" : "offline")));
          break;
        case "question_start":
          renderQuestion(msg);
          break;
        case "answer_count":
          $("q-answered").textContent = msg.answered;
          $("q-online").textContent = msg.total;
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
