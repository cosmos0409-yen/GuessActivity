// 題庫驗證（伺服器端，最終把關）。
// 主持人可以在建立房間時上傳題庫（由主持人瀏覽器讀取 Google 試算表「搶答題」分頁後轉成 JSON）；
// 沒有上傳就用內建的 src/questions.js。不管哪一種，都要通過這裡的檢查才會存進房間。
//
// 題目格式：{ text, choices: [2–4 個字串], correct: 選項索引, timeLimit: 秒數, image: 圖片網址或 null }
// 正解只存在伺服器與主持人端，玩家的 question_start 只帶選項文字（規格確認文件 T1）。

export const DEFAULT_TIME_LIMIT = 20;
export const LIMITS = {
  maxQuestions: 50,
  text: 200,
  choice: 40,
  image: 300,
  minTime: 5,
  maxTime: 120,
};

// 圖片只接受兩種：https 網址，或放在 public/img/ 底下的檔案（/img/檔名，不能有子資料夾或 ..）
export function isValidImage(image) {
  if (typeof image !== "string" || image.length > LIMITS.image) return false;
  if (/^https:\/\/[^\s]+$/.test(image)) return true;
  return /^\/img\/[^/\\?#\s]+$/.test(image) && !image.includes("..");
}

export function validateQuestions(list) {
  const errors = [];
  const questions = [];
  if (!Array.isArray(list) || list.length === 0) return { questions, errors: ["題庫是空的"] };
  if (list.length > LIMITS.maxQuestions) {
    errors.push(`題目最多 ${LIMITS.maxQuestions} 題（目前 ${list.length} 題）`);
  }

  list.slice(0, LIMITS.maxQuestions).forEach((q, i) => {
    const bad = (reason) => errors.push(`第 ${i + 1} 題：${reason}`);
    const text = typeof q?.text === "string" ? q.text.trim() : "";
    const choices = Array.isArray(q?.choices) ? q.choices.map((c) => (typeof c === "string" ? c.trim() : "")) : [];
    const timeLimit = q?.timeLimit ?? DEFAULT_TIME_LIMIT;
    const image = q?.image || null;

    if (!text) return bad("缺少題目");
    if (text.length > LIMITS.text) return bad(`題目超過 ${LIMITS.text} 字`);
    if (choices.length < 2 || choices.length > 4 || choices.some((c) => !c)) return bad("選項要 2–4 個，而且不能空白");
    if (choices.some((c) => c.length > LIMITS.choice)) return bad(`選項超過 ${LIMITS.choice} 字`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= choices.length) return bad("正解不在選項範圍內");
    if (!Number.isInteger(timeLimit) || timeLimit < LIMITS.minTime || timeLimit > LIMITS.maxTime) {
      return bad(`秒數要是 ${LIMITS.minTime}–${LIMITS.maxTime} 的整數`);
    }
    if (image && !isValidImage(image)) return bad("圖片要是 https:// 開頭的網址，或 public/img/ 裡的檔名");

    questions.push({ text, choices, correct: q.correct, timeLimit, image });
  });

  return { questions, errors };
}
