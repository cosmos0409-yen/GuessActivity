import { connectRoom } from "/shared/ws-client.js";
import { syncClock, remainingMs } from "/shared/time-sync.js";
import { CHOICE_STYLES } from "/shared/choices.js";
// QR code 在瀏覽器裡直接產生，不呼叫任何外部 API（qrcode-generator，MIT 授權，檔案放在 public/shared/）
import qrcode from "/shared/qrcode.mjs";
import { parseQuestionCsv } from "/shared/question-csv.js";
// 合成音效：與決賽共用 src/audio/SoundManager.ts（由 tools/build-sound.mjs 產生），只在投影幕這台電腦播放
import soundManager from "/shared/sound.js";

const HOST_KEY = "liveQuiz.host";
// 題庫設定：選哪一種、試算表網址；另外存一份最後一次讀成功的 CSV，現場讀不到試算表時拿來用
const BANK_KEY = "liveQuiz.bank";
const BANK_CACHE_KEY = "liveQuiz.bankCache";
const SHEET_TIMEOUT_MS = 8000;
// 正式題庫（試算表「搶答題」分頁發布的 CSV）的預設網址：這台電腦沒有存過網址時自動填入，換電腦不用再貼。
// ⚠️ 使用者 2026-09-17 明知風險後決定寫在這裡：host.js 是公開檔案，有心人可以從這個網址看到正解。
const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDMOTLgvahrEnSwzReVTj9CEbwKDgXjrAZ3Tu7h8mFLWTJlQr4gwfTOJjwLfSgFjbEhEeUxunp3viH/pub?gid=1063568289&single=true&output=csv";
// 決賽（闖關猜謎）的網址：「前往決賽」會帶上前 3 名的暱稱（?c=第1名&c=第2名&c=第3名），
// 決賽大廳會把這 3 個名字顯示成按鈕，點一下就帶入挑戰者姓名。
const FINALS_URL = "https://cosmos0409-yen.github.io/GuessActivity/";
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
let currentRoom = null; // { roomCode, hostToken }
let playersList = []; // 最新的完整名單（lobby_update），玩家名單對話框用
let pendingKick = null; // 等待確認要移出的玩家 { playerId, nickname }
let flashTimer = null;
let sheetQuestions = null; // 最近一次從試算表讀到、通過檢查的題目
// 題目圖片預先載入：網址 → Promise<是否成功>。<img> 物件留在 preloadedImgs 裡，避免被回收後又要重新下載。
const preloaded = new Map();
const preloadedImgs = [];

function show(section) {
  for (const id of SECTIONS) $(id).hidden = id !== section;
  const inRoom = section !== "setup";
  $("manage").hidden = !inRoom || section === "final";
  $("takeover").hidden = !inRoom;
  document.body.classList.toggle("fit", FIT_SECTIONS.includes(section));
  scheduleFit();
  currentSection = section;
  applySceneSound(section);
}

// ---------- 音效 ----------
// 等待室：輕柔背景音；出題：出題音＋倒數節拍（最後 5 秒加快）；時間到：時間到音效；
// 答案揭曉：揭曉音；最終排名：慶祝音。瀏覽器規定要先點一下畫面才能出聲。
let currentSection = "setup";
let soundUnlocked = false;
let soundScene = ""; // 同一題只播一次出題音／揭曉音（重新連線、名單更新時不重播）
let soundQuestionIndex = -1;
let timerUrgent = false;
let timeUpPlayed = false;

function applySceneSound(section) {
  const key = section === "question" || section === "result" ? `${section}:${soundQuestionIndex}` : section;
  if (key === soundScene) return;
  soundScene = key;
  soundManager.setBedUrgent(false);
  if (section === "lobby") {
    soundManager.startBed("lobby");
  } else if (section === "question") {
    soundManager.stopBed();
    soundManager.play("questionShow");
    soundManager.startBed("countdown");
  } else if (section === "result") {
    soundManager.stopBed();
    soundManager.play("correct");
  } else if (section === "final") {
    soundManager.stopBed();
    soundManager.play("champion");
  } else {
    soundManager.stopBed();
  }
}

function unlockSound() {
  if (soundUnlocked) return;
  soundManager.unlock();
  soundUnlocked = true;
  $("sound-unlock").hidden = true;
  soundScene = ""; // 解鎖前的場景沒有出聲，解鎖後補上目前畫面的聲音
  applySceneSound(currentSection);
}

function renderSoundControls() {
  const muted = soundManager.isMuted();
  $("sound-toggle").textContent = muted ? "🔇" : "🔊";
  $("sound-toggle").setAttribute("aria-pressed", String(muted));
  $("sound-toggle").title = muted ? "目前靜音，點一下開啟音效" : "點一下靜音";
  $("sound-volume").value = String(soundManager.getVolume());
}

document.addEventListener("pointerdown", unlockSound, true);
document.addEventListener("keydown", unlockSound, true);

// ---------- 版面：一個螢幕高、依圖片方向排版、放不下就縮小字級 ----------
// 以 1366×768 為基準：出題、答案揭曉、最終排名都不能捲動，按鈕永遠在畫面內。
const FIT_SECTIONS = ["question", "result", "final"];
const FIT_MIN = 0.5; // 字級最多縮到 50%；CSS 另有 max(28px…) 等下限，確保最後一排看得清楚
const PORTRAIT_MAX_RATIO = 1.1; // 寬÷高小於這個值算直式（含接近正方形），圖左字右
const SHORT_CHOICE = 8; // 橫式圖片時，選項都不超過這個字數就排成一排
let fitPending = false;

// 依圖片長寬比切換版面：直式 → 圖左字右；橫式 → 圖在題目下方、寬度拉滿
function applyImageLayout(layout, img, hasImage, choices, tiles, allowOneRow = true) {
  layout.classList.remove("portrait", "landscape");
  tiles.classList.remove("one-row");
  if (!hasImage) return;
  const decide = () => {
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5;
    const portrait = ratio < PORTRAIT_MAX_RATIO;
    layout.classList.toggle("portrait", portrait);
    layout.classList.toggle("landscape", !portrait);
    layout.dataset.ratio = String(ratio);
    tiles.classList.toggle("one-row", allowOneRow && !portrait && choices.every((c) => c.length <= SHORT_CHOICE));
    scheduleFit();
  };
  if (img.complete && img.naturalWidth) decide();
  else {
    layout.classList.add("landscape"); // 圖片還沒載入完（理論上已預先載入）先用橫式，載入後再決定
    img.addEventListener("load", decide, { once: true });
  }
}

// 等這一輪 DOM 更新完就量（microtask 會強制排版，不依賴重繪；分頁在背景時 requestAnimationFrame 不會跑）
function scheduleFit() {
  if (fitPending) return;
  fitPending = true;
  queueMicrotask(() => {
    fitPending = false;
    fitVisibleSection();
  });
}

function fitVisibleSection() {
  const sec = FIT_SECTIONS.map((id) => $(id)).find((s) => !s.hidden);
  if (!sec) return;
  // 直式圖片的欄寬：依版面高度與長寬比算，最多佔 42% 寬
  for (const layout of sec.querySelectorAll(".portrait")) {
    const ratio = Number(layout.dataset.ratio) || 0.75;
    layout.style.setProperty("--img-col", `${Math.round(Math.min(layout.clientHeight * ratio, layout.clientWidth * 0.42))}px`);
  }
  // 量的時候先停掉進場動畫：頒獎台「升起」一開始會往下位移，會被誤判成超出畫面；移除後動畫從頭正常播放
  sec.classList.add("fit-measuring");
  for (let fit = 1; ; fit -= 0.04) {
    sec.style.setProperty("--fit", fit.toFixed(2));
    if (fits(sec) || fit <= FIT_MIN) break;
  }
  sec.classList.remove("fit-measuring");
}

// 放得下＝區塊本身與標了 data-fit 的格子都沒有被裁切，而且橫式圖片至少保有版面一半的高度（先縮字，把高度讓給照片）
function fits(sec) {
  const boxes = [sec, ...sec.querySelectorAll("[data-fit]")].filter((b) => b.offsetParent);
  if (boxes.some((b) => b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1)) return false;
  for (const layout of sec.querySelectorAll(".landscape")) {
    const img = layout.querySelector("img");
    const want = Math.min(img.naturalHeight || Infinity, layout.clientHeight * 0.5);
    if (img.clientHeight + 1 < want) return false;
  }
  return true;
}

window.addEventListener("resize", scheduleFit);

// 短暫提示（例如「已移出 OOO」），3 秒後自動消失
function flash(text) {
  clearTimeout(flashTimer);
  $("status").textContent = text;
  flashTimer = setTimeout(() => {
    if ($("status").textContent === text) $("status").textContent = "";
  }, 3000);
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

function forgetHost() {
  try {
    localStorage.removeItem(HOST_KEY);
  } catch {
    /* 忽略 */
  }
}

// 備援電腦接手：開啟「host.html#takeover=房間碼.主持人驗證碼」就會存進這台電腦並進入房間。
// 驗證碼只放在網址的 # 後面（瀏覽器不會把 # 之後送到伺服器），讀完立刻從網址列清掉，避免投影出來。
function readTakeoverHash() {
  const match = /^#takeover=(\d{6})\.([0-9a-f-]{36})$/i.exec(location.hash);
  if (!match) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return { roomCode: match[1], hostToken: match[2] };
}

// ---------- 題目圖片預先載入 ----------
// 主持人一拿到題庫（建立房間或重新連線）就在背景下載全部圖片，出題時圖片直接從瀏覽器快取顯示，
// 不會發生「題目先出現、圖片晚一兩秒才跑出來」。等待室顯示載入結果，讀不到的圖片在開始前就會被發現。
function preloadImages(list) {
  const urls = [...new Set(list.map((q) => q.image).filter(Boolean))];
  const box = $("img-status");
  box.hidden = urls.length === 0;
  if (!urls.length) return;

  let loaded = 0;
  const failed = [];
  const update = () => {
    const finished = loaded + failed.length === urls.length;
    box.classList.toggle("bad", failed.length > 0);
    box.classList.toggle("ok", finished && failed.length === 0);
    if (failed.length) {
      box.textContent = `⚠ ${failed.sort((a, b) => a - b).map((n) => `第 ${n} 題`).join("、")}的圖片讀不到，請檢查試算表的「圖片網址」`;
    } else if (finished) {
      box.textContent = `✓ 題目圖片 ${urls.length} 張都已預先載入`;
    } else {
      box.textContent = `題目圖片預先載入中…（${loaded}／${urls.length}）`;
    }
  };
  update();

  for (const url of urls) {
    if (!preloaded.has(url)) {
      const img = new Image();
      preloaded.set(
        url,
        new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        }),
      );
      preloadedImgs.push(img);
      img.src = url;
    }
    preloaded.get(url).then((ok) => {
      if (ok) loaded++;
      else list.forEach((q, i) => q.image === url && failed.push(i + 1));
      update();
    });
  }
}

// ---------- 題庫（建立房間前） ----------
function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存不進去就只是下次要重新讀取 */
  }
}

function bankMode() {
  return document.querySelector('input[name="bank"]:checked').value;
}

function setBankStatus(text, kind = "") {
  $("bank-status").textContent = text;
  $("bank-status").className = `small ${kind}`;
}

function saveBankSettings() {
  writeJson(BANK_KEY, { mode: bankMode(), url: $("sheet-url").value.trim() });
}

// 讀取試算表：先試網路（8 秒逾時）；失敗就用這台電腦上次存下的同一個網址的內容。
// 預覽只列題目與秒數，不列正解（這個畫面可能已經投影出來）。
async function loadSheet() {
  const url = $("sheet-url").value.trim();
  sheetQuestions = null;
  $("bank-warnings").replaceChildren();
  $("bank-preview").replaceChildren();
  if (!/^https:\/\//i.test(url)) {
    setBankStatus("請貼上 https:// 開頭的 CSV 網址", "bad");
    return null;
  }
  saveBankSettings();
  setBankStatus("讀取中…");
  $("load-sheet").disabled = true;

  let csv = null;
  let note = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csv = await res.text();
    if (/^\s*<!doctype html|^\s*<html/i.test(csv)) throw new Error("拿到的是網頁，不是 CSV（發布格式要選「逗號分隔值檔案」）");
    writeJson(BANK_CACHE_KEY, { url, csv, fetchedAt: Date.now() });
  } catch (err) {
    const cache = readJson(BANK_CACHE_KEY);
    if (cache?.url === url && cache.csv) {
      csv = cache.csv;
      note = `（讀不到試算表：${err.name === "AbortError" ? "逾時" : err.message}；改用這台電腦 ${new Date(cache.fetchedAt).toLocaleString("zh-TW")} 存下的版本）`;
    } else {
      setBankStatus(`讀不到試算表：${err.name === "AbortError" ? "超過 8 秒沒有回應" : err.message}`, "bad");
      return null;
    }
  } finally {
    clearTimeout(timer);
    $("load-sheet").disabled = false;
  }

  const { questions, warnings } = parseQuestionCsv(csv);
  $("bank-warnings").replaceChildren(
    ...warnings.map((w) => el("li", "", w.row ? `第 ${w.row} 列：${w.reason}` : w.reason)),
  );
  $("bank-preview").replaceChildren(
    ...questions.map((q) => {
      const item = el("li", "", q.text);
      item.append(el("span", "meta", `${q.choices.length} 選 1・${q.timeLimit} 秒${q.image ? "・有圖片" : ""}`));
      return item;
    }),
  );
  if (!questions.length) {
    setBankStatus(`沒有可以出的題目${note}`, "bad");
    return null;
  }
  sheetQuestions = questions;
  const skipped = warnings.filter((w) => w.row > 1).length;
  setBankStatus(
    `讀到 ${questions.length} 題${skipped ? `，跳過 ${skipped} 列（原因見下方）` : ""}${note}`,
    note || warnings.length ? "warn" : "ok",
  );
  return questions;
}

function updateBankUi() {
  $("sheet-box").hidden = bankMode() !== "sheet";
  saveBankSettings();
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

  playersList = msg.players;
  const seen = new Set();
  for (const p of msg.players) {
    seen.add(p.playerId);
    let item = nameItems.get(p.playerId);
    if (!item) {
      item = el("li", "", p.nickname);
      item.dataset.playerId = p.playerId;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
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
  if ($("players-dialog").open) renderPlayersDialog();
}

// ---------- 踢人 ----------
function askKick(playerId) {
  const player = playersList.find((p) => p.playerId === playerId);
  if (!player) return;
  pendingKick = player;
  $("kick-name").textContent = player.nickname;
  $("kick-dialog").showModal();
  $("kick-cancel").focus(); // 預設焦點放在「取消」，避免誤按 Enter 就踢人
}

function renderPlayersDialog() {
  const keyword = $("pd-filter").value.trim();
  const list = keyword ? playersList.filter((p) => p.nickname.includes(keyword)) : playersList;
  $("pd-count").textContent = playersList.length;
  $("pd-list").replaceChildren(
    ...(list.length
      ? list.map((p) => {
          const item = el("li", p.online ? "" : "offline");
          const btn = el("button", "btn btn-danger", "移出");
          btn.type = "button";
          btn.addEventListener("click", () => askKick(p.playerId));
          item.append(el("span", "pd-name", p.nickname + (p.online ? "" : "（離線）")), btn);
          return item;
        })
      : [el("li", "pd-empty", keyword ? "沒有符合的暱稱" : "還沒有人加入")]),
  );
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
  timerUrgent = false;
  timeUpPlayed = remainingMs(startedAt, timeLimit) <= 0; // 重新連線時已經時間到：不要再播一次
  const ring = $("timer");
  const tick = () => {
    const left = remainingMs(startedAt, timeLimit);
    $("q-seconds").textContent = Math.ceil(left / 1000);
    ring.style.setProperty("--p", String(left / (timeLimit * 1000)));
    const urgent = left > 0 && left <= URGENT_MS;
    ring.classList.toggle("urgent", urgent);
    if (urgent !== timerUrgent) {
      timerUrgent = urgent;
      soundManager.setBedUrgent(urgent);
    }
    if (left <= 0 && !timeUpPlayed && currentSection === "question") {
      timeUpPlayed = true;
      soundManager.stopBed();
      soundManager.play("timeUp");
    }
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
  soundQuestionIndex = q.questionIndex;
  $("q-number").textContent = `${q.questionIndex + 1}／${q.totalQuestions}`;
  $("q-text").textContent = question.text;
  $("q-image").hidden = !question.image;
  if (question.image) $("q-image").src = question.image;
  renderAnswerCount(0, Number($("q-online").textContent) || 0);
  renderProgress(q.questionIndex);
  $("q-choices").replaceChildren(...question.choices.map((text, i) => tile(i, text)));
  applyImageLayout($("q-layout"), $("q-image"), Boolean(question.image), question.choices, $("q-choices"));
  show("question");
  startTimer(q.startedAt, q.timeLimit);
}

// ---------- 答案揭曉 ----------
function renderResult(r) {
  cancelAnimationFrame(timerFrame);
  const question = questions[r.questionIndex];
  soundQuestionIndex = r.questionIndex;
  $("r-number").textContent = r.questionIndex + 1;
  $("r-text").textContent = question.text;
  // 圖片題：答案揭曉時也顯示圖片（已經在建立房間時預先載入，直接從快取顯示）
  $("r-image").hidden = !question.image;
  if (question.image) $("r-image").src = question.image;
  else $("r-image").removeAttribute("src");
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

  // restored：主持人斷線後回來補送的結果，沒有「上一題」可以比較，不顯示名次變化與分數動畫
  renderLeaderboard(r.leaderboard, { showMoves: !r.restored && r.questionIndex > 0, animate: !r.restored });

  $("next").textContent = r.isLast ? "看最終排名" : "下一題";
  // 答案揭曉的結果色塊有人數與「正確答案」標籤，不排成一排
  applyImageLayout($("r-layout"), $("r-image"), Boolean(question.image), question.choices, $("r-dist"), false);
  show("result");
}

function renderLeaderboard(leaderboard, { showMoves, animate }) {
  $("r-leaderboard").replaceChildren(
    ...leaderboard.map((p) => {
      const item = el("li");
      const before = prevRanks.get(p.nickname);
      const moved = before ? before - p.rank : 0;
      const label = !showMoves ? "" : before === undefined ? "新進榜" : moved > 0 ? `▲ ${moved}` : "";
      const from = animate ? (prevScores.get(p.nickname) ?? 0) : p.score;
      const score = el("span", "lb-score", String(from));
      item.append(el("span", "rank-badge", String(p.rank)), el("span", "lb-name", p.nickname), el("span", "lb-move", label), score);
      countUp(score, from, p.score);
      return item;
    }),
  );
  prevRanks = new Map(leaderboard.map((p) => [p.nickname, p.rank]));
  prevScores = new Map(leaderboard.map((p) => [p.nickname, p.score]));
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
  // 前往決賽：依名次帶上前 3 名的暱稱
  const finalists = [...podium].sort((a, b) => a.rank - b.rank).map((p) => p.nickname);
  $("to-finals").hidden = finalists.length === 0;
  $("to-finals").dataset.url = finalists.length
    ? `${FINALS_URL}?${finalists.map((n) => `c=${encodeURIComponent(n)}`).join("&")}`
    : "";
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
  currentRoom = { roomCode, hostToken };
  // 按「建立房間」時已經點過畫面、聲音已解鎖；重新整理後自動回到房間則還沒點過，顯示提示
  $("sound-unlock").hidden = soundUnlocked;
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
          preloadImages(questions);
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
        case "kick_done":
          flash(`已移出「${msg.nickname}」`);
          break;
        case "leaderboard_update":
          // 答案揭曉畫面移出玩家後，前 5 名直接換成新名單（不重播動畫）
          renderLeaderboard(msg.leaderboard, { showMoves: false, animate: false });
          break;
        case "error":
          flash(msg.message);
          if (msg.code === "ROOM_NOT_FOUND" || msg.code === "BAD_HOST_TOKEN") {
            forgetHost();
            conn?.close();
            conn = null;
            currentRoom = null;
            $("create").disabled = false;
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
    let body;
    if (bankMode() === "sheet") {
      // 還沒按「讀取」就直接建立房間：先讀一次；讀不到就不建立，避免主持人以為用的是試算表題庫
      const questions = sheetQuestions ?? (await loadSheet());
      if (!questions) throw new Error("試算表題庫還沒讀好，請先確認上方的訊息");
      body = JSON.stringify({ questions });
    }
    const res = await fetch("/api/rooms", { method: "POST", body, headers: body ? { "content-type": "application/json" } : {} });
    const data = await res.json();
    if (!res.ok) throw new Error([data.error || "建立房間失敗", ...(data.errors ?? [])].join("\n"));
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

// 暱稱牆：點名字（或聚焦後按 Enter）→ 確認後移出
$("players").addEventListener("click", (event) => {
  const item = event.target.closest("li[data-player-id]");
  if (item) askKick(item.dataset.playerId);
});
$("players").addEventListener("keydown", (event) => {
  const item = event.target.closest("li[data-player-id]");
  if (item && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    askKick(item.dataset.playerId);
  }
});
$("kick-cancel").addEventListener("click", () => $("kick-dialog").close());
$("kick-confirm").addEventListener("click", () => {
  if (pendingKick) conn?.send({ type: "kick", playerId: pendingKick.playerId });
  pendingKick = null;
  $("kick-dialog").close();
});

$("manage").addEventListener("click", () => {
  $("pd-filter").value = "";
  renderPlayersDialog();
  $("players-dialog").showModal();
});
$("pd-filter").addEventListener("input", renderPlayersDialog);
$("pd-close").addEventListener("click", () => $("players-dialog").close());

// 接手連結只複製到剪貼簿、不顯示在畫面上（主持人畫面會投影，驗證碼不能讓觀眾看到）
$("takeover").addEventListener("click", async () => {
  if (!currentRoom) return;
  const link = `${location.origin}${location.pathname}#takeover=${currentRoom.roomCode}.${currentRoom.hostToken}`;
  try {
    await navigator.clipboard.writeText(link);
    flash("已複製接手連結：在備援電腦開啟就能接手這個房間（不要貼到公開的地方）");
  } catch {
    flash("無法複製（瀏覽器不允許存取剪貼簿）");
  }
});

$("to-finals").addEventListener("click", () => {
  const url = $("to-finals").dataset.url;
  if (url) window.open(url, "_blank", "noopener");
});

$("new-room").addEventListener("click", () => {
  if (!confirm("要結束這個房間、建立新的房間嗎？")) return;
  forgetHost();
  conn?.close();
  conn = null;
  currentRoom = null;
  nameItems.clear();
  $("players").replaceChildren();
  playersList = [];
  lastPlayerCount = 0;
  prevRanks = new Map();
  prevScores = new Map();
  $("create").disabled = false;
  $("top-room").hidden = true;
  $("top-count").hidden = true;
  $("confetti").replaceChildren();
  show("setup");
});

for (const radio of document.querySelectorAll('input[name="bank"]')) radio.addEventListener("change", updateBankUi);
$("load-sheet").addEventListener("click", loadSheet);
$("sound-toggle").addEventListener("click", () => {
  soundManager.setMuted(!soundManager.isMuted());
  renderSoundControls();
});
$("sound-volume").addEventListener("input", (e) => {
  soundManager.setVolume(Number(e.target.value));
  if (soundManager.isMuted() && Number(e.target.value) > 0) soundManager.setMuted(false);
  renderSoundControls();
});
renderSoundControls();
$("sheet-url").addEventListener("change", () => {
  sheetQuestions = null;
  saveBankSettings();
});
const bankSettings = readJson(BANK_KEY);
$("sheet-url").value = bankSettings?.url || DEFAULT_SHEET_URL;
if (bankSettings?.mode === "sheet") document.querySelector('input[name="bank"][value="sheet"]').checked = true;
$("sheet-box").hidden = bankMode() !== "sheet";

const takeover = readTakeoverHash();
if (takeover) saveHost(takeover);
const saved = takeover ?? loadHost();
if (saved?.roomCode && saved?.hostToken) enterRoom(saved);
else show("setup");
