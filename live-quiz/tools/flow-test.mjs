// 完整流程測試：模擬 1 位主持人＋多位玩家，逐項驗證訊息協定與計分。
// 用法（在 live-quiz/ 底下）：
//   node tools/flow-test.mjs                                  # 測本機 wrangler dev（127.0.0.1:8787）
//   node tools/flow-test.mjs https://live-quiz.xxx.workers.dev  # 測正式網址
// 需要 Node 22 以上（內建 WebSocket）。
import { scoreFor } from "../src/scoring.js";
import { QUESTIONS } from "../src/questions.js";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = BASE.replace(/^http/, "ws") + "/ws?room=";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) failed++;
};

function client(room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_BASE + room);
    const msgs = [];
    ws.onmessage = (e) => e.data !== "pong" && msgs.push(JSON.parse(e.data));
    ws.onerror = () => reject(new Error("WebSocket 連線失敗"));
    ws.onopen = () =>
      resolve({
        ws,
        msgs,
        send: (o) => ws.send(JSON.stringify(o)),
        last: (t) => [...msgs].reverse().find((m) => m.type === t),
        all: (t) => msgs.filter((m) => m.type === t),
        waitFor: async (t, pred = () => true, timeout = 30000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const m = [...msgs].reverse().find((x) => x.type === t && pred(x));
            if (m) return m;
            await wait(50);
          }
          throw new Error(`等不到 ${t}`);
        },
      });
  });
}

// ---------- 計分公式（純函式） ----------
ok(scoreFor(0, 20) === 1000, "計分：0 秒答對 1000 分");
ok(scoreFor(20000, 20) === 500, "計分：剛好 20 秒答對 500 分");
ok(scoreFor(10000, 20) === 750, "計分：10 秒答對 750 分");
ok(scoreFor(25000, 20) === 500, "計分：寬限期內送達以時限計，最低 500 分");

// ---------- 建房與加入 ----------
const { roomCode, hostToken } = await (await fetch(`${BASE}/api/rooms`, { method: "POST" })).json();
console.log(`房間 ${roomCode}，題數 ${QUESTIONS.length}`);
const host = await client(roomCode);
host.send({ type: "join", role: "host", roomCode, hostToken });
const hostJoined = await host.waitFor("joined");
ok(Array.isArray(hostJoined.questions) && hostJoined.questions.length === QUESTIONS.length, "主持人收到題庫（含正解，只給主持人）");

const players = [];
for (const name of ["阿明", "小華", "大雄"]) {
  const p = await client(roomCode);
  p.send({ type: "join", role: "player", roomCode, nickname: name });
  const joined = await p.waitFor("joined");
  ok(joined.questions === undefined, `${name} 的 joined 沒有題庫`);
  players.push({ ...p, name, playerId: joined.playerId });
}

// 非主持人不能開始
players[0].send({ type: "start" });
ok((await players[0].waitFor("error")).code === "NOT_HOST", "玩家送 start 被拒絕（NOT_HOST）");

// ---------- 第 1 題：不同速度作答、重複作答 ----------
host.send({ type: "start" });
const qs = await players[0].waitFor("question_start", (m) => m.questionIndex === 0);
ok(qs.choices?.length === 4 && qs.text === undefined, "question_start 帶選項文字、不帶題目本文");
ok(typeof qs.startedAt === "number" && typeof qs.serverNow === "number", "question_start 帶 startedAt 與 serverNow");
ok(players[1].msgs.every((m) => m.type !== "answer_count"), "玩家收不到 answer_count");

const q0 = QUESTIONS[0];
const wrong0 = (q0.correct + 1) % 4;
players[0].send({ type: "answer", questionIndex: 0, choice: q0.correct }); // 最快、答對
await wait(1500);
players[1].send({ type: "answer", questionIndex: 0, choice: q0.correct }); // 較慢、答對
players[0].send({ type: "answer", questionIndex: 0, choice: wrong0 }); // 重複作答 → 忽略
const dup = await players[0].waitFor("answer_ack", (m) => m.accepted === false);
ok(dup.reason === "duplicate", "重複作答只採計第一次");
const count = await host.waitFor("answer_count", (m) => m.answered === 2);
ok(count.answered === 2 && count.total === 3, "主持人收到已作答 2/3");
players[2].send({ type: "answer", questionIndex: 0, choice: wrong0 }); // 答錯 → 全部答完，提前結算

const end0 = await host.waitFor("question_end", (m) => m.questionIndex === 0, 5000);
ok(end0.correctChoice === q0.correct, "question_end 公布正確答案");
ok(end0.distribution[q0.correct] === 2 && end0.distribution[wrong0] === 1, "作答分布正確（重複作答沒有算進去）");
ok(end0.leaderboard[0].nickname === "阿明" && end0.leaderboard[1].nickname === "小華", "排行榜：答得快的排前面");
const r0 = await players[0].waitFor("your_result", (m) => m.questionIndex === 0);
ok(r0.correct && r0.points > 900 && r0.points <= 1000 && r0.rank === 1, `阿明答對、得分 ${r0.points}、第 1 名`);
const r1 = await players[1].waitFor("your_result", (m) => m.questionIndex === 0);
ok(r1.correct && r1.points < r0.points && r1.points >= 900, `小華答對但較慢、得分 ${r1.points}`);
const r2 = await players[2].waitFor("your_result", (m) => m.questionIndex === 0);
ok(!r2.correct && r2.points === 0 && r2.rank === 3, "大雄答錯 0 分、第 3 名");

// ---------- 第 2 題：時間到才結算（主持人提前結束代替等 20 秒）＋ 中途重連 ----------
host.send({ type: "next" });
await players[1].waitFor("question_start", (m) => m.questionIndex === 1);
players[1].ws.close();
await wait(500);
const back = await client(roomCode);
back.send({ type: "join", role: "player", roomCode, playerId: players[1].playerId });
const rejoin = await back.waitFor("joined");
ok(rejoin.phase === "question" && rejoin.question?.questionIndex === 1 && rejoin.question.answered === false, "出題中重連：拿回目前題目、尚未作答");
ok(rejoin.totalScore === r1.totalScore, "重連後分數保留");
players[1] = { ...back, name: "小華", playerId: players[1].playerId };
host.send({ type: "end_question" });
const end1 = await host.waitFor("question_end", (m) => m.questionIndex === 1);
ok(end1.answered === 0, "主持人提前結束：沒有人作答");
const late = await client(roomCode);
late.send({ type: "join", role: "player", roomCode, nickname: "遲到的人" });
const lateJoined = await late.waitFor("joined");
ok(lateJoined.phase === "result", "遊戲中途可以加入（遲到）");
const lateAnswer = players[0];
lateAnswer.send({ type: "answer", questionIndex: 1, choice: 0 });
ok((await lateAnswer.waitFor("answer_ack", (m) => m.questionIndex === 1)).accepted === false, "結算後送出的答案不採計");

// ---------- 其餘題目快速跑完 ----------
for (let i = 2; i < QUESTIONS.length; i++) {
  host.send({ type: "next" });
  await host.waitFor("question_start", (m) => m.questionIndex === i);
  host.send({ type: "end_question" });
  await host.waitFor("question_end", (m) => m.questionIndex === i);
}
host.send({ type: "next" });
const final = await host.waitFor("game_end");
ok(final.finalLeaderboard[0].nickname === "阿明", "最終排名第 1 名是阿明");
ok(final.podium?.length === 3 && final.podium.every((p) => /^\d{4}$/.test(p.verifyCode)), "主持人拿到前 3 名與 4 位數驗證碼");
const myFinal = await players[0].waitFor("game_end");
ok(myFinal.you?.rank === 1 && myFinal.you.verifyCode === final.podium[0].verifyCode, "第 1 名手機顯示的驗證碼與主持人一致");
const lateFinal = await late.waitFor("game_end");
ok(lateFinal.you?.verifyCode === null || lateFinal.you?.rank > 3, "非前 3 名沒有驗證碼");
ok(final.podium.every((p) => p.playerId === undefined), "主持人收到的頒獎資料不含 playerId");

// ---------- 階段 4：踢人、主持人斷線恢復 ----------
const roomB = await (await fetch(`${BASE}/api/rooms`, { method: "POST" })).json();
const hostB = await client(roomB.roomCode);
hostB.send({ type: "join", role: "host", roomCode: roomB.roomCode, hostToken: roomB.hostToken });
await hostB.waitFor("joined");
const pB = [];
for (const name of ["甲", "乙", "不當暱稱"]) {
  const p = await client(roomB.roomCode);
  p.closedCode = new Promise((r) => p.ws.addEventListener("close", (e) => r(e.code)));
  p.send({ type: "join", role: "player", roomCode: roomB.roomCode, nickname: name });
  p.playerId = (await p.waitFor("joined")).playerId;
  pB.push(p);
}
pB[0].send({ type: "kick", playerId: pB[2].playerId });
ok((await pB[0].waitFor("error")).code === "NOT_HOST", "玩家送 kick 被拒絕（NOT_HOST）");

hostB.send({ type: "kick", playerId: pB[2].playerId });
await pB[2].waitFor("kicked");
ok((await pB[2].closedCode) === 4403, "等待室踢人：被踢的人收到 kicked、連線以 4403 關閉");
const afterKick = await hostB.waitFor("lobby_update", (m) => m.playerCount === 2);
ok(!afterKick.players.some((p) => p.nickname === "不當暱稱"), "等待室踢人：主持人名單拿掉這個暱稱");
ok((await hostB.waitFor("kick_done")).nickname === "不當暱稱", "主持人收到 kick_done");
hostB.send({ type: "kick", playerId: pB[2].playerId });
ok((await hostB.waitFor("error", (m) => m.code === "PLAYER_NOT_FOUND")).code === "PLAYER_NOT_FOUND", "重複踢同一人回報 PLAYER_NOT_FOUND");
const retry = await client(roomB.roomCode);
retry.send({ type: "join", role: "player", roomCode: roomB.roomCode, nickname: "換個名字", playerId: pB[2].playerId });
ok((await retry.waitFor("kicked")).type === "kicked", "被踢的人帶原本的 playerId 回來仍被擋下");

hostB.send({ type: "start" });
await pB[0].waitFor("question_start", (m) => m.questionIndex === 0);
const qB = QUESTIONS[0];
pB[0].send({ type: "answer", questionIndex: 0, choice: qB.correct });
pB[1].send({ type: "answer", questionIndex: 0, choice: (qB.correct + 1) % 4 });
const endB = await hostB.waitFor("question_end", (m) => m.questionIndex === 0, 5000);
ok(endB.answered === 2 && endB.playerCount === 2, "被踢的人不影響「全員答完提前結算」與人數");

hostB.send({ type: "kick", playerId: pB[0].playerId });
const lbUpdate = await hostB.waitFor("leaderboard_update");
ok(lbUpdate.leaderboard.length === 1 && lbUpdate.leaderboard[0].nickname === "乙", "答案揭曉時踢人：前 5 名立刻更新");

hostB.ws.close();
await wait(300);
const hostB2 = await client(roomB.roomCode);
hostB2.send({ type: "join", role: "host", roomCode: roomB.roomCode, hostToken: roomB.hostToken });
const rejoinB = await hostB2.waitFor("joined");
const restoredB = await hostB2.waitFor("question_end");
ok(rejoinB.phase === "result" && restoredB.restored === true, "主持人斷線回來：補送答案揭曉（restored）");
ok(restoredB.leaderboard.length === 1 && restoredB.playerCount === 1, "補送的結算已經拿掉被踢的人");
hostB2.send({ type: "next" });
ok((await hostB2.waitFor("question_start", (m) => m.questionIndex === 1)).questionIndex === 1, "重連後的主持人可以繼續下一題");
const badHost = await client(roomB.roomCode);
badHost.send({ type: "join", role: "host", roomCode: roomB.roomCode, hostToken: "00000000-0000-0000-0000-000000000000" });
ok((await badHost.waitFor("error")).code === "BAD_HOST_TOKEN", "驗證碼錯誤不能接手主持人");

// ---------- 階段 5：主持人上傳題庫（試算表「搶答題」分頁）、圖片題 ----------
const customBank = [
  { text: "（上傳）二選一附圖", choices: ["是", "否"], correct: 1, timeLimit: 10, image: "/img/sample.svg" },
  { text: "（上傳）四選一", choices: ["甲", "乙", "丙", "丁"], correct: 2, timeLimit: 20, image: null },
];
const createC = await fetch(`${BASE}/api/rooms`, { method: "POST", body: JSON.stringify({ questions: customBank }) });
const roomC = await createC.json();
ok(createC.status === 201 && roomC.totalQuestions === 2 && roomC.bankSource === "uploaded", "上傳 2 題的題庫可以建立房間");
const hostC = await client(roomC.roomCode);
hostC.send({ type: "join", role: "host", roomCode: roomC.roomCode, hostToken: roomC.hostToken });
const hostCJoined = await hostC.waitFor("joined");
ok(JSON.stringify(hostCJoined.questions) === JSON.stringify(customBank), "主持人拿到的是上傳的題庫（含正解與圖片）");
const pC = await client(roomC.roomCode);
pC.send({ type: "join", role: "player", roomCode: roomC.roomCode, nickname: "上傳測試" });
const pCJoined = await pC.waitFor("joined");
ok(pCJoined.totalQuestions === 2 && pCJoined.questions === undefined, "玩家看到題數 2，但拿不到題庫");
hostC.send({ type: "start" });
const qsC = await pC.waitFor("question_start", (m) => m.questionIndex === 0);
ok(qsC.choices.length === 2 && qsC.timeLimit === 10, "二選一題：玩家收到 2 個選項、秒數 10");
ok(!("correct" in qsC) && !("text" in qsC) && !("image" in qsC), "question_start 不帶正解、題目本文與圖片");
pC.send({ type: "answer", questionIndex: 0, choice: 1 });
const rC = await pC.waitFor("your_result", (m) => m.questionIndex === 0, 5000);
ok(rC.correct === true, "上傳題庫的正解用來計分（選「否」答對）");
pC.send({ type: "answer", questionIndex: 0, choice: 3 });
hostC.send({ type: "next" });
await pC.waitFor("question_start", (m) => m.questionIndex === 1);
pC.send({ type: "answer", questionIndex: 1, choice: 3 });
ok((await pC.waitFor("answer_ack", (m) => m.questionIndex === 1)).accepted === true, "第 2 題四選一可以選 D");

const badBank = await fetch(`${BASE}/api/rooms`, {
  method: "POST",
  body: JSON.stringify({ questions: [{ text: "壞題", choices: ["只有一個"], correct: 0 }] }),
});
const badBankBody = await badBank.json();
ok(badBank.status === 400 && badBankBody.errors?.[0]?.includes("第 1 題"), "不合格的題庫被拒絕，並指出第幾題");
const notJson = await fetch(`${BASE}/api/rooms`, { method: "POST", body: "不是 JSON" });
ok(notJson.status === 400, "題庫不是 JSON 時回 400");
const huge = await fetch(`${BASE}/api/rooms`, { method: "POST", body: "x".repeat(100_001) });
ok(huge.status === 413, "題庫超過 100 KB 時回 413");
const img = await fetch(`${BASE}/img/sample.svg`);
ok(img.ok && (img.headers.get("content-type") ?? "").includes("svg"), "public/img/ 的圖片可以讀取");

for (const c of [host, late, ...players, hostB, hostB2, retry, badHost, ...pB, hostC, pC]) {
  try {
    c.ws.close();
  } catch {
    /* 已關閉 */
  }
}
console.log(failed ? `\n${failed} 項失敗` : "\n全部通過");
setTimeout(() => process.exit(failed ? 1 : 0), 300);
