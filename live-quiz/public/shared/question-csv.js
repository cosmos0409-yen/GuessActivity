// 試算表「搶答題」分頁 → 題庫（在主持人的瀏覽器裡執行；Node 測試腳本也可以直接 import）。
//
// 欄位（第一列是標題，順序不重要，名稱要完全照抄）：
//   題目, 圖片網址, A, B, C, D, 正解, 秒數, 狀態
//   - A、B 必填；C、D 可以留空（變成 2 選 1 或 3 選 1），但不能跳著填（有 D 就一定要有 C）
//   - 正解：A–D，大小寫都可以；要指到有填的選項
//   - 秒數：留空是 20 秒；5–120 的整數
//   - 圖片網址：留空＝沒有圖片；填檔名（例如 q3.jpg）＝ live-quiz/public/img/q3.jpg；也可以填 https:// 網址
//   - 狀態：留空或「上架」會出題；「待審」會跳過
// 不合格的列整列跳過並記下原因（不會讓整份題庫失敗）；最後仍由伺服器的 validateQuestions 再檢查一次。

const LETTERS = ["A", "B", "C", "D"];
const DEFAULT_TIME_LIMIT = 20;
const LIMITS = { maxQuestions: 50, text: 200, choice: 40, minTime: 5, maxTime: 120 };

// RFC 4180 CSV 解析（與闖關遊戲 src/data/csv.ts 同樣的規則）：雙引號欄位、欄位內逗號與換行、"" 跳脫、BOM、CRLF
export function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function toImage(value) {
  const v = value.trim();
  if (!v) return { image: null };
  if (/^https:\/\//i.test(v)) return { image: v };
  if (/^http:\/\//i.test(v)) return { error: "圖片網址要用 https://（http:// 在正式網址上會被瀏覽器擋掉）" };
  if (/[/\\?#]|\.\./.test(v)) return { error: "圖片檔名不能包含 / \\ ? # 或 ..（請直接放在 public/img/ 底下）" };
  return { image: `/img/${v}` };
}

export function parseQuestionCsv(csvText) {
  const rows = parseCsv(csvText);
  const questions = [];
  const warnings = [];
  if (!rows.length) return { questions, warnings: [{ row: 1, reason: "試算表是空的" }] };

  const header = rows[0].map((h) => h.trim());
  for (const required of ["題目", "A", "B", "正解"]) {
    if (!header.includes(required)) warnings.push({ row: 1, reason: `標題列缺少「${required}」欄` });
  }
  if (warnings.length) return { questions, warnings };

  for (let r = 1; r < rows.length; r++) {
    const rowNo = r + 1; // 對應試算表的列號（第 1 列是標題）
    const get = (key) => (rows[r][header.indexOf(key)] ?? "").trim();
    const skip = (reason) => warnings.push({ row: rowNo, reason });

    const status = get("狀態");
    if (status === "待審") continue;
    if (status && status !== "上架") {
      skip(`「狀態」只能填「上架」或「待審」：${status}`);
      continue;
    }

    const text = get("題目");
    if (!text) {
      skip("缺少題目");
      continue;
    }
    if (text.length > LIMITS.text) {
      skip(`題目超過 ${LIMITS.text} 字`);
      continue;
    }

    const filled = LETTERS.map((l) => get(l));
    const count = filled.findLastIndex((c) => c !== "") + 1;
    const choices = filled.slice(0, count);
    if (count < 2 || choices.some((c) => !c)) {
      skip("選項至少要填 A、B，而且不能跳著填（例如有 D 沒有 C）");
      continue;
    }
    if (choices.some((c) => c.length > LIMITS.choice)) {
      skip(`選項超過 ${LIMITS.choice} 字（手機畫面放不下）`);
      continue;
    }

    const correct = LETTERS.indexOf(get("正解").toUpperCase());
    if (correct < 0 || correct >= count) {
      skip(`「正解」要填 ${LETTERS.slice(0, count).join("／")} 其中一個：${get("正解") || "(空白)"}`);
      continue;
    }

    const secondsRaw = get("秒數");
    const timeLimit = secondsRaw === "" ? DEFAULT_TIME_LIMIT : Number(secondsRaw);
    if (!Number.isInteger(timeLimit) || timeLimit < LIMITS.minTime || timeLimit > LIMITS.maxTime) {
      skip(`「秒數」要是 ${LIMITS.minTime}–${LIMITS.maxTime} 的整數：${secondsRaw}`);
      continue;
    }

    const img = toImage(get("圖片網址"));
    if (img.error) {
      skip(img.error);
      continue;
    }

    questions.push({ text, choices, correct, timeLimit, image: img.image });
  }

  if (questions.length > LIMITS.maxQuestions) {
    warnings.push({ row: 0, reason: `題目最多 ${LIMITS.maxQuestions} 題，只會使用前 ${LIMITS.maxQuestions} 題` });
    questions.length = LIMITS.maxQuestions;
  }
  return { questions, warnings };
}
