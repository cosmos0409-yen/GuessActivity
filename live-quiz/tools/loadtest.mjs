// 壓力測試（階段 4）：模擬 1 位主持人＋N 位玩家（預設 150）同時加入並作答，量測延遲並驗證結果正確。
//
// 用法（在 live-quiz/ 底下，需要 Node 22 以上）：
//   node tools/loadtest.mjs                                     # 本機 wrangler dev，150 人
//   node tools/loadtest.mjs https://live-quiz.xxx.workers.dev   # 正式網址
//   node tools/loadtest.mjs http://127.0.0.1:8787 50            # 指定人數
//
// ⚠️ 不要在活動當天對正式網址跑：一次約用掉 SQLite 寫入 1,000 列、DO 請求幾百次（免費額度每天 10 萬），
//    量不大，但活動當天沒有必要冒險。
//
// 測試腳本（全部自動）：
//   加入   N 條 WebSocket 同時連線並 join
//   第 1 題 全員在 0.5–6 秒內作答 → 全員答完提前結算（量測「最後一個答案 → 結算送達」）
//   第 2 題 10% 不作答 → 等 DO alarm 時間到結算；同時測 10 人斷線重連、主持人踢 1 人、
//          主持人在出題中斷線、時間到之後才回來（要拿到補送的結算）
//   第 3 題 一半人作答後主持人按「提前結束」；被踢的人帶原本的 playerId 回來要被擋下
//   其餘題 主持人直接提前結束，最後看最終排名與前 3 名驗證碼
import { QUESTIONS } from "../src/questions.js";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const N = Number(process.argv[3] ?? 150);
const WS_BASE = BASE.replace(/^http/, "ws") + "/ws?room=";
const SILENT = Math.round(N * 0.1); // 第 2 題不作答的人數（索引 0..SILENT-1）
const RECONNECT = Math.min(10, Math.max(1, Math.round(N * 0.07))); // 第 2 題斷線重連的人數
const KICK_INDEX = N - 1; // 第 2 題被踢的人

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
let failed = 0;
const results = [];
function ok(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  results.push({ pass: !!cond, label });
  if (!cond) failed++;
}

function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, p50: NaN, p95: NaN, max: NaN };
  const pick = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, p50: pick(0.5), p95: pick(0.95), max: v[v.length - 1] };
}
const ms = (x) => (Number.isFinite(x) ? `${Math.round(x)} ms` : "—");
const metrics = [];
function metric(label, values, note = "") {
  const s = stats(values);
  metrics.push({ label, ...s, note });
  console.log(`  ⏱ ${label}：n=${s.n}　p50 ${ms(s.p50)}　p95 ${ms(s.p95)}　max ${ms(s.max)}${note ? `　（${note}）` : ""}`);
}

// 每個客戶端：記下每則訊息的收到時間（_t = performance.now()，_d = Date.now()），用事件驅動的 waitFor 等訊息。
function client(room, label) {
  const ws = new WebSocket(WS_BASE + room);
  const c = { ws, label, msgs: [], waiters: [], errors: [], closeCode: null };
  c.send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  c.find = (type, pred = () => true) => c.msgs.find((m) => m.type === type && pred(m));
  c.waitFor = (type, pred = () => true, timeout = 45000) =>
    new Promise((resolve, reject) => {
      const hit = c.find(type, pred);
      if (hit) return resolve(hit);
      const w = { type, pred, resolve };
      c.waiters.push(w);
      setTimeout(() => {
        const i = c.waiters.indexOf(w);
        if (i >= 0) {
          c.waiters.splice(i, 1);
          reject(new Error(`${label} 等不到 ${type}`));
        }
      }, timeout);
    });
  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    const m = JSON.parse(e.data);
    m._t = now();
    m._d = Date.now();
    c.msgs.push(m);
    if (m.type === "error") c.errors.push(m);
    for (const w of [...c.waiters]) {
      if (w.type === m.type && w.pred(m)) {
        c.waiters.splice(c.waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  };
  c.opened = new Promise((resolve, reject) => {
    ws.onopen = () => resolve(c);
    ws.onerror = () => reject(new Error(`${label} 連線失敗`));
  });
  c.closed = new Promise((resolve) => ws.addEventListener("close", (e) => resolve((c.closeCode = e.code))));
  return c;
}

async function settle(promises) {
  const out = await Promise.allSettled(promises);
  const rejected = out.filter((r) => r.status === "rejected");
  if (rejected.length) console.log(`  ⚠ ${rejected.length} 個失敗，例如：${rejected[0].reason?.message}`);
  return out.map((r) => (r.status === "fulfilled" ? r.value : null));
}

const tAll = now();
console.log(`壓力測試：${BASE}，${N} 位玩家，${QUESTIONS.length} 題`);

// ---------- 建房、主持人 ----------
const { roomCode, hostToken } = await (await fetch(`${BASE}/api/rooms`, { method: "POST" })).json();
console.log(`房間 ${roomCode}`);
let host = client(roomCode, "主持人");
await host.opened;
host.send({ type: "join", role: "host", roomCode, hostToken });
await host.waitFor("joined");

// ---------- 加入：N 條連線同時打進來 ----------
const bots = [];
const joinStart = now();
for (let i = 0; i < N; i++) {
  const b = client(roomCode, `機器人${i + 1}`);
  b.index = i;
  b.nickname = `機器人${i + 1}`;
  b.opened.then(() => b.send({ type: "join", role: "player", roomCode, nickname: b.nickname })).catch(() => {});
  bots.push(b);
}
const joined = await settle(bots.map((b) => b.waitFor("joined")));
bots.forEach((b, i) => {
  b.playerId = joined[i]?.playerId;
  b.score = 0;
});
metric("加入（開始連線 → 收到 joined）", joined.map((m) => m && m._t - joinStart));
ok(joined.every(Boolean), `${N} 人全部加入成功`);
ok(new Set(joined.map((m) => m?.playerId)).size === N, "每個人拿到不同的 playerId");
const hostFull = await host.waitFor("lobby_update", (m) => m.playerCount === N, 15000).catch(() => null);
ok(hostFull !== null, `主持人名單顯示 ${N} 人`);
if (hostFull) metric("主持人看到最後一人加入", [hostFull._t - joinStart]);
await wait(1500); // 玩家端的人數每秒最多更新一次
ok(bots.every((b) => [...b.msgs].reverse().find((m) => m.type === "lobby_update")?.playerCount === N), `玩家端人數都更新成 ${N}（節流後）`);
const lobbyMsgs = bots.reduce((sum, b) => sum + b.msgs.filter((m) => m.type === "lobby_update").length, 0);
console.log(`  玩家端共收到 lobby_update ${lobbyMsgs} 則（沒有節流的話會接近 ${(N * (N + 1)) / 2} 則）`);
ok(lobbyMsgs < N * 10, "玩家端人數廣播有節流");

// 作答：記錄送出時間、選項，等 ack
async function answer(b, qi, choice, delay) {
  await wait(delay);
  if (b.kicked) return null;
  b.choice ??= {};
  b.choice[qi] = choice;
  const sentAt = now();
  b.send({ type: "answer", questionIndex: qi, choice });
  const ack = await b.waitFor("answer_ack", (m) => m.questionIndex === qi, 15000);
  return { sentAt, ackMs: ack._t - sentAt, accepted: ack.accepted };
}

function checkResults(qi, activeBots, expectAnswered) {
  const q = QUESTIONS[qi];
  let wrong = 0;
  for (const b of activeBots) {
    const r = b.find("your_result", (m) => m.questionIndex === qi);
    const choice = b.choice?.[qi];
    const shouldAnswer = choice !== undefined;
    const correct = choice === q.correct;
    if (
      !r ||
      r.answered !== shouldAnswer ||
      r.correct !== correct ||
      (correct ? r.points < 500 || r.points > 1000 : r.points !== 0) ||
      r.totalScore !== b.score + r.points
    ) {
      wrong++;
      if (wrong <= 3) console.log(`    ✗ ${b.nickname}`, { choice, correct: q.correct, r: r && { answered: r.answered, correct: r.correct, points: r.points, totalScore: r.totalScore }, before: b.score });
    }
    if (r) b.score = r.totalScore;
  }
  ok(wrong === 0, `第 ${qi + 1} 題：${activeBots.length} 人的個人結果（對錯、得分、總分）全部正確`);
  const end = host.find("question_end", (m) => m.questionIndex === qi);
  ok(end?.answered === expectAnswered, `第 ${qi + 1} 題：已作答 ${end?.answered}，應為 ${expectAnswered}`);
  ok(end && end.distribution.reduce((a, b) => a + b, 0) === end.answered, `第 ${qi + 1} 題：作答分布加總等於作答人數`);
  const ranks = activeBots.map((b) => b.find("your_result", (m) => m.questionIndex === qi)?.rank).filter(Boolean);
  ok(new Set(ranks).size === ranks.length, `第 ${qi + 1} 題：名次沒有重複`);
  const first = activeBots.find((b) => b.find("your_result", (m) => m.questionIndex === qi)?.rank === 1);
  ok(first && end?.leaderboard[0]?.nickname === first.nickname, `第 ${qi + 1} 題：主持人排行榜第 1 名與玩家手機一致`);
}

const rnd = (a, b) => a + Math.random() * (b - a);
const randomChoice = () => Math.floor(Math.random() * 4);

// ---------- 第 1 題：全員作答 → 提前結算 ----------
console.log("\n第 1 題：全員作答，全部答完就提前結算");
let t = now();
host.send({ type: "start" });
const qs0 = await settle(bots.map((b) => b.waitFor("question_start", (m) => m.questionIndex === 0)));
metric("出題廣播（主持人按開始 → 玩家收到題目）", qs0.map((m) => m && m._t - t));
const a0 = await settle(bots.map((b) => answer(b, 0, randomChoice(), rnd(500, 6000))));
metric("作答回應（送出 → 收到 answer_ack）", a0.map((a) => a?.ackMs));
ok(a0.every((a) => a?.accepted), "第 1 題：所有答案都被接受");
const lastSent0 = Math.max(...a0.map((a) => a?.sentAt ?? 0));
const end0 = await settle(bots.map((b) => b.waitFor("question_end", (m) => m.questionIndex === 0)));
await settle(bots.map((b) => b.waitFor("your_result", (m) => m.questionIndex === 0)));
await host.waitFor("question_end", (m) => m.questionIndex === 0);
metric("提前結算（最後一個答案送出 → 玩家收到結算）", end0.map((m) => m && m._t - lastSent0));
checkResults(0, bots, N);

// ---------- 第 2 題：時間到結算＋斷線重連＋踢人＋主持人斷線 ----------
console.log(`\n第 2 題：${SILENT} 人不答（等時間到）、${RECONNECT} 人斷線重連、踢 1 人、主持人中途斷線`);
t = now();
host.send({ type: "next" });
const qs1 = await settle(bots.map((b) => b.waitFor("question_start", (m) => m.questionIndex === 1)));
metric("出題廣播（第 2 題）", qs1.map((m) => m && m._t - t));
const q1 = qs1.find(Boolean);
// 把伺服器的截止時間（startedAt + 時限 + 0.5 秒寬限）換算成本機時間；誤差約為單程網路延遲
const deadlineLocal = q1.startedAt + q1.timeLimit * 1000 + 500 - (q1.serverNow - q1._d);

const tasks = [];
// (a) 斷線重連：一出題就斷線，1 秒後帶 playerId 重新加入，再作答
const reconnectIdx = Array.from({ length: RECONNECT }, (_, k) => SILENT + k);
for (const i of reconnectIdx) {
  tasks.push(
    (async () => {
      const old = bots[i];
      old.ws.close();
      await wait(1000);
      const nb = client(roomCode, old.label);
      Object.assign(nb, { index: i, nickname: old.nickname, playerId: old.playerId, score: old.score, choice: old.choice });
      await nb.opened;
      nb.send({ type: "join", role: "player", roomCode, playerId: old.playerId });
      const j = await nb.waitFor("joined");
      bots[i] = nb;
      nb.rejoinOk = j.phase === "question" && j.question?.questionIndex === 1 && j.question.answered === false && j.totalScore === old.score && j.nickname === old.nickname;
      return answer(nb, 1, randomChoice(), rnd(500, 4000));
    })(),
  );
}
// (b) 其他人（不含不作答的、重連的、要被踢的）在 1–10 秒內作答
for (let i = SILENT + RECONNECT; i < N; i++) {
  if (i === KICK_INDEX) continue;
  tasks.push(answer(bots[i], 1, randomChoice(), rnd(1000, 10000)));
}
// (c) 2 秒時踢掉最後一位（他原本打算 4 秒時作答）
const kicked = bots[KICK_INDEX];
tasks.push(
  (async () => {
    await wait(2000);
    host.send({ type: "kick", playerId: kicked.playerId });
    await kicked.waitFor("kicked", () => true, 10000);
    kicked.kicked = true;
    await kicked.closed;
  })(),
);
// (d) 主持人 3 秒時斷線，時間到之後 1.5 秒才用驗證碼回來
const hostBack = (async () => {
  await wait(3000);
  const kickDone = host.find("kick_done");
  const lobbyAfterKick = [...host.msgs].reverse().find((m) => m.type === "lobby_update");
  host.ws.close();
  await wait(Math.max(0, deadlineLocal - Date.now()) + 1500);
  host = client(roomCode, "主持人（重連）");
  await host.opened;
  host.send({ type: "join", role: "host", roomCode, hostToken });
  const j = await host.waitFor("joined");
  const restored = await host.waitFor("question_end", (m) => m.questionIndex === 1, 5000).catch(() => null);
  return { kickDone, lobbyAfterKick, j, restored };
})();
await settle(tasks);
const end1 = await settle(bots.map((b) => (b.kicked ? null : b.waitFor("question_end", (m) => m.questionIndex === 1))));
await settle(bots.map((b) => (b.kicked ? null : b.waitFor("your_result", (m) => m.questionIndex === 1))));
metric("時間到結算（伺服器截止時間 → 玩家收到結算）", end1.filter(Boolean).map((m) => m._d - deadlineLocal), "含 DO alarm 誤差；本機時鐘換算誤差約 ± 單程延遲");
const hb = await hostBack;
ok(reconnectIdx.every((i) => bots[i].rejoinOk), `${RECONNECT} 人出題中重連：拿回目前題目、暱稱與分數`);
ok(kicked.closeCode === 4403, `被踢的人收到 kicked，連線以 4403 關閉（實際 ${kicked.closeCode}）`);
ok(hb.kickDone?.nickname === kicked.nickname, "主持人收到「已移出」通知");
ok(hb.lobbyAfterKick?.playerCount === N - 1 && !hb.lobbyAfterKick.players.some((p) => p.playerId === kicked.playerId), `踢人後主持人名單剩 ${N - 1} 人`);
ok(hb.j.phase === "result" && hb.j.questionIndex === 1, "主持人斷線期間時間到，回來時直接進入答案揭曉");
ok(hb.restored?.restored === true && hb.restored.answered === N - SILENT - 1, "主持人回來時收到補送的結算（restored）");
const active = () => bots.filter((b) => !b.kicked);
checkResults(1, active(), N - SILENT - 1);
ok(!host.find("question_end", (m) => m.questionIndex === 1).leaderboard.some((p) => p.nickname === kicked.nickname), "被踢的人不在排行榜");

// ---------- 第 3 題：主持人提前結束＋被踢的人想回來 ----------
console.log("\n第 3 題：一半人作答後主持人提前結束");
host.send({ type: "next" });
await settle(active().map((b) => b.waitFor("question_start", (m) => m.questionIndex === 2)));
const half = active().filter((_, k) => k % 2 === 0);
await settle(half.map((b) => answer(b, 2, randomChoice(), rnd(300, 3000))));
const back = client(roomCode, "被踢的人重連");
await back.opened;
back.send({ type: "join", role: "player", roomCode, playerId: kicked.playerId });
await back.waitFor("kicked", () => true, 5000).catch(() => null);
ok((await back.closed) === 4403, "被踢的人帶原本的 playerId 回來會被擋下");
t = now();
host.send({ type: "end_question" });
const end2 = await settle(active().map((b) => b.waitFor("question_end", (m) => m.questionIndex === 2)));
await settle(active().map((b) => b.waitFor("your_result", (m) => m.questionIndex === 2)));
await host.waitFor("question_end", (m) => m.questionIndex === 2);
metric("主持人提前結束（按下 → 玩家收到結算）", end2.map((m) => m && m._t - t));
checkResults(2, active(), half.length);

// ---------- 其餘題目快速跑完 → 最終排名 ----------
for (let qi = 3; qi < QUESTIONS.length; qi++) {
  host.send({ type: "next" });
  await host.waitFor("question_start", (m) => m.questionIndex === qi);
  host.send({ type: "end_question" });
  await host.waitFor("question_end", (m) => m.questionIndex === qi);
}
t = now();
host.send({ type: "next" });
const fin = await settle(active().map((b) => b.waitFor("game_end")));
const hostFin = await host.waitFor("game_end");
metric("最終排名（按下 → 玩家收到）", fin.map((m) => m && m._t - t));
ok(fin.every(Boolean), `${active().length} 人都收到最終排名`);
ok(hostFin.podium?.length === 3 && hostFin.podium.every((p) => /^\d{4}$/.test(p.verifyCode)), "主持人拿到前 3 名驗證碼");
const podiumOk = hostFin.podium.every((p) => fin.some((m) => m?.you?.rank === p.rank && m.you.verifyCode === p.verifyCode));
ok(podiumOk, "前 3 名手機上的驗證碼與主持人一致");
ok(fin.filter((m) => m?.you?.verifyCode).length === 3, "只有 3 支手機拿到驗證碼");
ok(fin.every((m) => m?.playerCount === N - 1), `最終人數 ${N - 1}（不含被踢的人）`);
const errs = [host, ...bots].flatMap((c) => c.errors);
ok(errs.length === 0, `全程沒有收到 error 訊息${errs.length ? `（${errs.map((e) => e.code).join(",")}）` : ""}`);

for (const c of [host, back, ...bots]) {
  try {
    c.ws.close();
  } catch {
    /* 已關閉 */
  }
}

// ---------- 報告 ----------
console.log(`\n## 壓力測試結果（${new Date().toISOString()}）\n`);
console.log(`- 目標：${BASE}，玩家 ${N} 人，房間 ${roomCode}，總耗時 ${((now() - tAll) / 1000).toFixed(1)} 秒`);
console.log(`- 檢查：${results.length - failed}／${results.length} 通過\n`);
console.log("| 量測項目 | 樣本數 | p50 | p95 | 最大值 | 備註 |");
console.log("|---|---|---|---|---|---|");
for (const m of metrics) console.log(`| ${m.label} | ${m.n} | ${ms(m.p50)} | ${ms(m.p95)} | ${ms(m.max)} | ${m.note} |`);
console.log(failed ? `\n${failed} 項失敗` : "\n全部通過");
setTimeout(() => process.exit(failed ? 1 : 0), 300);
