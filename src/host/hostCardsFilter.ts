// 主持人手卡篩選邏輯：獨立成純函式，方便測試「預設只顯示上架題目」與
// 依題型／難度篩選；HostCards.tsx 只負責用這個函式的結果畫面卡片。

import type { Question } from "../data/types";

export interface HostCardsFilter {
  /** 未指定或空字串代表「全部題型」 */
  categoryName?: string;
  /** 未指定代表「全部難度」 */
  difficulty?: number;
  /** 是否包含「待審」的題目；預設 false（只顯示上架題目） */
  includeUnlisted?: boolean;
}

/** 依題型／難度／上架狀態篩選題目；預設（不傳 filter 或不設定 includeUnlisted）只回傳「上架」的題目。 */
export function filterHostCardQuestions(questions: Question[], filter: HostCardsFilter = {}): Question[] {
  const { categoryName, difficulty, includeUnlisted = false } = filter;
  return questions.filter((q) => {
    if (!includeUnlisted && q.status !== "上架") return false;
    if (categoryName && q.categoryName !== categoryName) return false;
    if (difficulty !== undefined && q.difficulty !== difficulty) return false;
    return true;
  });
}

/** 手卡排序：題型名稱排序，同題型內依難度排序，方便主持人依難度順序整理。 */
export function sortHostCardQuestions(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => {
    if (a.categoryName !== b.categoryName) return a.categoryName.localeCompare(b.categoryName, "zh-Hant");
    return a.difficulty - b.difficulty;
  });
}
