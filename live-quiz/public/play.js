import { connectRoom } from "/shared/ws-client.js";

const $ = (id) => document.getElementById(id);
// playerId 依房間分開存：重新整理或斷線重連時帶著它 join，伺服器會找回原本的暱稱（與之後的分數）。
const playerKey = (roomCode) => `liveQuiz.player.${roomCode}`;

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

function join(roomCode, nickname) {
  const conn = connectRoom(roomCode, {
    onOpen: () =>
      conn.send({ type: "join", role: "player", roomCode, nickname, playerId: readPlayerId(roomCode) }),
    onStatus: (s) => {
      $("status").textContent = { connecting: "連線中…", open: "", reconnecting: "連線中斷，重新連線中…", closed: "已中斷連線" }[s] ?? "";
    },
    onMessage: (msg) => {
      if (msg.type === "joined") {
        writePlayerId(roomCode, msg.playerId);
        $("join-form").hidden = true;
        $("waiting").hidden = false;
        $("my-name").textContent = msg.nickname;
      } else if (msg.type === "lobby_update") {
        $("count").textContent = msg.playerCount;
      } else if (msg.type === "kicked") {
        $("waiting").hidden = true;
        $("join-form").hidden = false;
        $("form-error").textContent = "你已被主持人移出房間";
      } else if (msg.type === "error") {
        $("join-form").hidden = false;
        $("waiting").hidden = true;
        $("form-error").textContent = msg.message;
        conn.close();
      }
    },
  });
}

const params = new URLSearchParams(location.search);
if (params.get("room")) $("room").value = params.get("room");

// 同一個房間已經加入過（有 playerId）：直接重連，不必再輸入暱稱。
const presetRoom = $("room").value;
if (/^\d{6}$/.test(presetRoom) && readPlayerId(presetRoom)) join(presetRoom, "");

$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("form-error").textContent = "";
  join($("room").value.trim(), $("nickname").value.trim());
});
