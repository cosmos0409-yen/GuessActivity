// 模擬玩家：建立房間（或加入指定房間）後，讓 N 位機器人加入，每題隨機 1–4 秒後作答。
// 用途：看主持人畫面的排行榜與頒獎台效果、階段 4 的壓力測試。
// 用法（在 live-quiz/ 底下）：
//   node tools/bots.mjs [網址] [人數] [房間碼]
//   node tools/bots.mjs http://127.0.0.1:8787 3          # 建立新房間，房間碼與主持人驗證碼寫到 tools/.last-room.json
//   node tools/bots.mjs http://127.0.0.1:8787 3 123456   # 加入既有房間
// 機器人答對率約 60%；遊戲結束或 10 分鐘後自動離開。
import { writeFileSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const COUNT = Number(process.argv[3] ?? 3);
let roomCode = process.argv[4];
const WS_BASE = BASE.replace(/^http/, "ws") + "/ws?room=";
const NAMES = ["法官甲", "檢察官乙", "律師丙", "書記官丁", "法警戊", "司法官己", "觀護人庚", "調查官辛"];

if (!roomCode) {
  const res = await fetch(`${BASE}/api/rooms`, { method: "POST" });
  const room = await res.json();
  roomCode = room.roomCode;
  writeFileSync(new URL("./.last-room.json", import.meta.url), JSON.stringify(room));
  console.log(`建立房間 ${roomCode}（主持人驗證碼已寫入 tools/.last-room.json）`);
}

let finished = 0;
for (let i = 0; i < COUNT; i++) {
  const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? i : "");
  const ws = new WebSocket(WS_BASE + roomCode);
  ws.onopen = () => ws.send(JSON.stringify({ type: "join", role: "player", roomCode, nickname: name }));
  ws.onmessage = (event) => {
    if (event.data === "pong") return;
    const msg = JSON.parse(event.data);
    if (msg.type === "question_start") {
      const delay = 1000 + Math.random() * 3000;
      // 不知道正解（正解只給主持人），用固定規則讓每位機器人的表現不同
      const choice = (msg.questionIndex + i) % msg.choices.length;
      setTimeout(() => ws.send(JSON.stringify({ type: "answer", questionIndex: msg.questionIndex, choice })), delay);
    }
    if (msg.type === "game_end") {
      console.log(`${name}：第 ${msg.you?.rank} 名，${msg.you?.totalScore} 分${msg.you?.verifyCode ? `，驗證碼 ${msg.you.verifyCode}` : ""}`);
      ws.close();
      if (++finished === COUNT) process.exit(0);
    }
  };
  ws.onerror = () => console.error(`${name} 連線失敗`);
}
setInterval(() => {}, 20000);
setTimeout(() => process.exit(0), 10 * 60 * 1000);
