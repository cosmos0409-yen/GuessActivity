import { connectRoom } from "/shared/ws-client.js";

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
  $("join-url").textContent = `${location.origin}/play.html?room=${roomCode}`;

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
