// App 流程的關鍵整合邏輯：把 data 層（picker / usedStore）跟遊戲流程接起來。
// 拆成純函式方便測試，不依賴 React。

import { drawQuestion, pickRemovableOption, type Rng } from "../data/picker";
import { getUsedIds, markUsed } from "../data/usedStore";
import type { Question, QuestionBank } from "../data/types";

export interface DrawForRoundOptions {
  bank: QuestionBank;
  category: string;
  difficulty: number;
  /** 本場（session）目前為止已經抽過的題目 id，跟 usedStore 的已使用 id 一起排除 */
  sessionUsedIds?: Iterable<string>;
  /** 彩排模式：不寫回 usedStore */
  rehearsal: boolean;
  rng?: Rng;
}

/**
 * 抽一題給目前這關：合併「本機已使用（usedStore）」與「本場目前已顯示過」的題目 id 做排除，
 * 抽到題目後，非彩排模式下立刻寫回 usedStore（呼叫端不需要另外呼叫 markUsed）。
 * 找不到符合條件的題目時回傳 null，且不會寫入 usedStore。
 */
export function drawQuestionForRound(options: DrawForRoundOptions): Question | null {
  const { bank, category, difficulty, sessionUsedIds = [], rehearsal, rng } = options;

  const excluded = new Set<string>(getUsedIds());
  for (const id of sessionUsedIds) excluded.add(id);

  const question = drawQuestion(bank, {
    category,
    difficulty,
    usedIds: excluded,
    rng,
  });

  if (question && !rehearsal) {
    markUsed(question.id);
  }

  return question;
}

/** 場次代碼：yyyymmdd-HHMMSS，供投票 roundId 與紀錄使用 */
export function makeSessionId(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** 「全場一起協助」投票用的 roundId：場次-關卡-題號 */
export function makeRoundId(sessionId: string, level: number, questionId: string): string {
  return `${sessionId}-${level}-${questionId}`;
}

export interface RemovableOptionResult {
  option: ReturnType<typeof pickRemovableOption>;
}

/** 包一層方便測試/mock：刪除一個選項提示卡要刪哪一個 */
export function chooseRemovableOption(question: Question, rng?: Rng): RemovableOptionResult {
  return { option: pickRemovableOption(question, rng) };
}
