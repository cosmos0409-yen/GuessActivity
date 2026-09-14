// Worker 入口：只負責路由。
//   POST /api/rooms      建立房間 → 回傳 { roomCode, hostToken }
//   GET  /ws?room=XXXXXX WebSocket 升級，轉交給該房間的 Durable Object
//   其他路徑             交給 Workers Static Assets（public/）
import { GameRoom } from "./game-room.js";

export { GameRoom };

const ROOM_CODE_RE = /^\d{6}$/;
const CREATE_ATTEMPTS = 5;
const MAX_BANK_BYTES = 100_000; // 50 題 × 每題幾百字，遠低於這個上限

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function createRoom(request, env) {
  // 主持人上傳的題庫（可以沒有）：原封不動轉給 DO，由 DO 驗證
  const body = await request.text();
  if (body.length > MAX_BANK_BYTES) return json({ error: "題庫太大" }, 413);
  // 房間碼是 6 位數字；萬一撞到正在使用中的房間（DO 回 409），換一個再試。
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const roomCode = String(Math.floor(100000 + Math.random() * 900000));
    const stub = env.GAME_ROOM.getByName(roomCode);
    const res = await stub.fetch(`https://room/init?code=${roomCode}`, { method: "POST", body });
    if (res.status === 201 || res.status === 400) return json(await res.json(), res.status);
  }
  return json({ error: "無法建立房間，請再試一次" }, 503);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") return json({ error: "只接受 POST" }, 405);
      return createRoom(request, env);
    }

    if (url.pathname === "/ws") {
      const roomCode = url.searchParams.get("room") ?? "";
      if (!ROOM_CODE_RE.test(roomCode)) return new Response("房間碼格式錯誤", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("這個網址只接受 WebSocket 連線", { status: 426 });
      }
      return env.GAME_ROOM.getByName(roomCode).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
