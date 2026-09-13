// 抽題與提示卡輔助函式。rng 皆可注入，方便測試。

import type { OptionKey, Question, QuestionBank } from "./types";

export type Rng = () => number;

const defaultRng: Rng = Math.random;

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

  const candidates = bank.questions.filter(
    (q) =>
      q.status === "上架" &&
      q.categoryName === category &&
      q.difficulty === difficulty &&
      !used.has(q.id),
  );

  if (candidates.length === 0) return null;

  const index = Math.floor(rng() * candidates.length);
  const clampedIndex = Math.min(Math.max(index, 0), candidates.length - 1);
  return candidates[clampedIndex];
}

/** 每個題型 × 每個難度（1-5）剩餘的可抽題數（上架且未使用） */
export type AvailabilityMap = Record<string, Record<number, number>>;

export function availability(bank: QuestionBank, usedIds: Set<string> | string[]): AvailabilityMap {
  const used = toSet(usedIds);
  const result: AvailabilityMap = {};

  for (const category of bank.categories) {
    result[category.name] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }

  for (const q of bank.questions) {
    if (q.status !== "上架") continue;
    if (used.has(q.id)) continue;
    if (!result[q.categoryName]) {
      result[q.categoryName] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    }
    result[q.categoryName][q.difficulty] = (result[q.categoryName][q.difficulty] ?? 0) + 1;
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
