import { connectRoom } from "/shared/ws-client.js";
// QR code 在瀏覽器裡直接產生，不呼叫任何外部 API（qrcode-generator，MIT 授權，檔案放在 public/shared/）
import qrcode from "/shared/qrcode.mjs";

function renderJoinQr(url) {
  const qr = qrcode(0, "M"); // 0 = 依內容長度自動選版本；M = 約 15% 容錯，投影反光時也掃得到
  qr.addData(url);
  qr.make();
  $("qr").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

const HOST_KEY = "liveQuiz.host";
const $ = (id) => document.getElementById(id);

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

function enterLobby({ roomCode, hostToken }) {
  $("setup").hidden = true;
  $("lobby").hidden = false;
  $("room-code").textContent = roomCode;
  const joinUrl = `${location.origin}/play.html?room=${roomCode}`;
  $("join-url").textContent = joinUrl;
  renderJoinQr(joinUrl);

  const conn = connectRoom(roomCode, {
    onOpen: () => conn.send({ type: "join", role: "host", roomCode, hostToken }),
    onStatus: (s) => {
      $("status").textContent = { connecting: "連線中…", open: "", reconnecting: "連線中斷，重新連線中…", closed: "已中斷連線" }[s] ?? "";
    },
    onMessage: (msg) => {
      if (msg.type === "lobby_update") {
        $("player-count").textContent = msg.playerCount;
        $("online-count").textContent = msg.onlineCount ?? msg.playerCount;
        const list = $("players");
        list.replaceChildren(
          ...msg.players.map((p) => {
            const li = document.createElement("li");
            li.textContent = p.nickname;
            if (!p.online) li.classList.add("offline");
            return li;
          }),
        );
      } else if (msg.type === "error") {
        $("status").textContent = msg.message;
        if (msg.code === "ROOM_NOT_FOUND" || msg.code === "BAD_HOST_TOKEN") {
          localStorage.removeItem(HOST_KEY);
        }
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
    enterLobby(data);
  } catch (err) {
    $("setup-error").textContent = err.message;
    $("create").disabled = false;
  }
});

const saved = loadHost();
if (saved?.roomCode && saved?.hostToken) enterLobby(saved);
