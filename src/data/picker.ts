// 抽題與提示卡輔助函式。rng 皆可注入，方便測試。

import type { OptionKey, Question, QuestionBank } from "./types";

export type Rng = () => number;

const defaultRng: Rng = Math.random;

/** Unicode「變體選擇符」（variation selector）碼位：U+FE0E（文字呈現）、U+FE0F（emoji 呈現）。
 * CSV 裡的題型名稱常帶 emoji（例如「⚖️」＝ U+2696 + U+FE0F），但同一個 emoji 有沒有帶
 * 變體選擇符，視輸入法／試算表軟體而定，不影響「這是同一個題型」的判斷。 */
const VARIATION_SELECTOR_CODE_POINTS = [0xfe0e, 0xfe0f];
const VARIATION_SELECTORS = VARIATION_SELECTOR_CODE_POINTS.map((cp) => String.fromCodePoint(cp));

/**
 * 題型名稱正規化：去除前後空白，並拿掉變體選擇符（見上）。
 * 題型比對（抽題、剩餘題數統計、PICK_CATEGORY 是否選過）一律要透過這個函式比對，
 * 否則同一個題型名稱只因為變體選擇符有無不同，就會被當成兩個不同的題型
 * （例如「剩餘 1 題」卻點了沒反應）。
 */
export function normalizeCategoryName(name: string): string {
  let result = name.trim();
  for (const vs of VARIATION_SELECTORS) {
    result = result.split(vs).join("");
  }
  return result;
}

// 題型名稱開頭的 emoji（可能是多個碼位組成，例如基底符號 + 變體選擇符），
// 後面接的空白也一併去掉。只用在「顯示」時，不能拿這個結果去比對或存資料，
// 資料本身（CSV 裡的名稱）不變。
const LEADING_EMOJI_PATTERN = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{FE0E}\u{FE0F}\u{200D}\s]+/u;

/**
 * 顯示用的題型名稱：去掉開頭的 emoji（題型卡片另外會顯示大圖示，
 * 名稱裡再帶一次 emoji 會變成圖示重複）。找不到開頭 emoji 時原樣傳回。
 */
export function stripLeadingEmoji(name: string): string {
  const stripped = name.replace(LEADING_EMOJI_PATTERN, "").trim();
  return stripped || name.trim();
}

export interface DrawQuestionOptions {
  category: string;
  difficulty: number;
  usedIds: Set<string> | string[];
  rng?: Rng;
}

function toSet(usedIds: Set<string> | string[]): Set<string> {
  return usedIds instanceof Set ? usedIds : new Set(usedIds);
}

/**
 * 只從「上架」且沒被用過的題目中，依題型與難度抽一題。
 * 找不到符合條件的題目時回傳 null。
 */
export function drawQuestion(bank: QuestionBank, options: DrawQuestionOptions): Question | null {
  const { category, difficulty, rng = defaultRng } = options;
  const used = toSet(options.usedIds);
  const targetCategory = normalizeCategoryName(category);

  const candidates = bank.questions.filter(
    (q) =>
      q.status === "上架" &&
      normalizeCategoryName(q.categoryName) === targetCategory &&
      q.difficulty === difficulty &&
      !used.has(q.id),
  );

  if (candidates.length === 0) return null;

  const index = Math.floor(rng() * candidates.length);
  const clampedIndex = Math.min(Math.max(index, 0), candidates.length - 1);
  return candidates[clampedIndex];
}

/**
 * 每個題型 × 每個難度（1-5）剩餘的可抽題數（上架且未使用）。
 * key 一律是 normalizeCategoryName() 之後的題型名稱；查詢時也要用
 * normalizeCategoryName() 處理過的名稱去查，不要直接拿原始（可能帶變體選擇符的）名稱當 key。
 */
export type AvailabilityMap = Record<string, Record<number, number>>;

export function availability(bank: QuestionBank, usedIds: Set<string> | string[]): AvailabilityMap {
  const used = toSet(usedIds);
  const result: AvailabilityMap = {};

  for (const category of bank.categories) {
    result[normalizeCategoryName(category.name)] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }

  for (const q of bank.questions) {
    if (q.status !== "上架") continue;
    if (used.has(q.id)) continue;
    const key = normalizeCategoryName(q.categoryName);
    if (!result[key]) {
      result[key] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    }
    result[key][q.difficulty] = (result[key][q.difficulty] ?? 0) + 1;
  }

  return result;
}

/**
 * 「刪除一個選項」提示卡：優先用題庫的「刪除選項優先」欄位，
 * 沒有指定時，從錯誤選項（非正解）中隨機挑一個。永遠不會刪到正解。
 */
export function pickRemovableOption(question: Question, rng: Rng = defaultRng): OptionKey {
  if (question.removalPriority && question.removalPriority !== question.correct) {
    return question.removalPriority;
  }

  const wrongOptions: OptionKey[] = (["A", "B", "C", "D"] as OptionKey[]).filter(
    (key) => key !== question.correct,
  );
  const index = Math.floor(rng() * wrongOptions.length);
  const clampedIndex = Math.min(Math.max(index, 0), wrongOptions.length - 1);
  return wrongOptions[clampedIndex];
}
