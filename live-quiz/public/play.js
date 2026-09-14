import { connectRoom } from "/shared/ws-client.js";
import { syncClock, remainingMs } from "/shared/time-sync.js";
import { CHOICE_STYLES } from "/shared/choices.js";

const URGENT_MS = 5000;
const $ = (id) => document.getElementById(id);
const SECTIONS = ["join-form", "waiting", "question", "submitted", "result", "final"];
// playerId 依房間分開存：重新整理或斷線重連時帶著它 join，伺服器會找回原本的暱稱與分數。
const playerKey = (roomCode) => `liveQuiz.player.${roomCode}`;

let conn = null;
let current = null; // 目前題目：{ questionIndex, startedAt, timeLimit }
let timer = null;

function show(section) {
  for (const id of SECTIONS) $(id).hidden = id !== section;
}

function readPlayerId(roomCode) {
  try {
    return localStorage.getItem(playerKey(roomCode));
  } catch {
    return null;
  }
}

function writePlayerId(roomCode, playerId) {
  try {
    localStorage.setItem(playerKey(roomCode), playerId);
  } catch {
    /* 存不進去就只是重新整理後要重新輸入暱稱 */
  }
}

function startCountdown() {
  clearInterval(timer);
  const tick = () => {
    const left = remainingMs(current.startedAt, current.timeLimit);
    const seconds = Math.ceil(left / 1000);
    $("q-seconds").textContent = seconds;
    $("s-seconds").textContent = seconds;
    $("sec-pill").classList.toggle("urgent", left > 0 && left <= URGENT_MS);
    if (left <= 0) {
      clearInterval(timer);
      for (const btn of $("choices").children) btn.disabled = true;
    }
  };
  tick();
  timer = setInterval(tick, 200);
}

function renderQuestion(q) {
  syncClock(q.serverNow);
  current = { questionIndex: q.questionIndex, startedAt: q.startedAt, timeLimit: q.timeLimit };
  $("q-number").textContent = `${q.questionIndex + 1}／${q.totalQuestions}`;
  // 色塊＋形狀＋選項文字（使用者裁決 C1：題目本文只在投影幕）
  $("choices").replaceChildren(
    ...q.choices.map((text, i) => {
      const style = CHOICE_STYLES[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `p-choice ${style.className}`;
      btn.setAttribute("aria-label", `${style.name}色${style.shape}：${text}`);
      const shape = document.createElement("span");
      shape.className = "choice-shape";
      shape.textContent = style.shape;
      const label = document.createElement("span");
      label.textContent = text;
      btn.append(shape, label);
      btn.addEventListener("click", () => submit(i));
      return btn;
    }),
  );
  show(q.answered ? "submitted" : "question");
  startCountdown();
}

function submit(choice) {
  if (!current) return;
  for (const btn of $("choices").children) btn.disabled = true;
  conn.send({ type: "answer", questionIndex: current.questionIndex, choice });
  const style = CHOICE_STYLES[choice];
  $("s-choice").className = `picked ${style.className}`;
  $("s-choice").textContent = style.shape;
  navigator.vibrate?.(30); // 支援的手機給一點震動回饋
  show("submitted");
}

function renderResult(msg) {
  clearInterval(timer);
  const kind = !msg.answered ? "none" : msg.correct ? "correct" : "wrong";
  $("result").className = `p-result is-${kind}`;
  $("res-icon").textContent = { correct: "✓", wrong: "✕", none: "…" }[kind];
  $("res-status").textContent = { correct: "答對了！", wrong: "答錯了", none: "這題沒有作答" }[kind];
  $("res-points").textContent = msg.correct ? `+${msg.points}` : "+0";
  $("res-total").textContent = msg.totalScore;
  $("res-rank").textContent = `${msg.rank}／${msg.playerCount}`;
  show("result");
}

function join(roomCode, nickname) {
  conn = connectRoom(roomCode, {
    onOpen: () =>
      conn.send({ type: "join", role: "player", roomCode, nickname, playerId: readPlayerId(roomCode) }),
    onStatus: (s) => {
      $("status").textContent = { connecting: "連線中…", open: "", reconnecting: "連線中斷，重新連線中…", closed: "已中斷連線" }[s] ?? "";
    },
    onMessage: (msg) => {
      switch (msg.type) {
        case "joined":
          syncClock(msg.serverNow);
          writePlayerId(roomCode, msg.playerId);
          $("my-name").textContent = msg.nickname;
          $("p-name").textContent = msg.nickname;
          $("p-name").hidden = false;
          if (msg.phase === "question" && msg.question) renderQuestion(msg.question);
          else if (msg.phase === "lobby") show("waiting");
          break;
        case "lobby_update":
          $("count").textContent = msg.playerCount;
          break;
        case "question_start":
          renderQuestion(msg);
          break;
        case "answer_ack":
          if (!msg.accepted && msg.reason === "late") $("status").textContent = "時間到，這次作答沒有送達";
          break;
        case "your_result":
          renderResult(msg);
          break;
        case "game_end":
          clearInterval(timer);
          $("fin-rank").textContent = msg.you?.rank ? `第 ${msg.you.rank} 名` : "—";
          $("fin-score").textContent = msg.you?.totalScore ?? 0;
          $("fin-podium").hidden = !msg.you?.verifyCode;
          $("fin-code").textContent = msg.you?.verifyCode ?? "";
          show("final");
          break;
        case "kicked":
          show("join-form");
          $("form-error").textContent = "你已被主持人移出房間";
          break;
        case "error":
          show("join-form");
          $("form-error").textContent = msg.message;
          conn.close();
          break;
      }
    },
  });
}

const params = new URLSearchParams(location.search);
if (params.get("room")) $("room").value = params.get("room");

// 同一個房間已經加入過（有 playerId）：直接重連，不必再輸入暱稱。
const presetRoom = $("room").value;
if (/^\d{6}$/.test(presetRoom) && readPlayerId(presetRoom)) join(presetRoom, "");
else show("join-form");

$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("form-error").textContent = "";
  join($("room").value.trim(), $("nickname").value.trim());
});
