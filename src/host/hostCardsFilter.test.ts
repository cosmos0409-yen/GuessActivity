import { describe, expect, it } from "vitest";
import { filterHostCardQuestions, sortHostCardQuestions } from "./hostCardsFilter";
import type { Question } from "../data/types";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    categoryName: "法條冷門角落",
    domain: "法律",
    difficulty: 1,
    text: `題目 ${id}`,
    options: { A: "A", B: "B", C: "C", D: "D" },
    correct: "A",
    explanation: "詳解",
    status: "上架",
    ...overrides,
  };
}

describe("filterHostCardQuestions", () => {
  const bank: Question[] = [
    q("Q1", { status: "上架", categoryName: "法條冷門角落", difficulty: 1 }),
    q("Q2", { status: "待審", categoryName: "法條冷門角落", difficulty: 2 }),
    q("Q3", { status: "上架", categoryName: "自然與科學冷知識", domain: "知識", difficulty: 3 }),
    q("Q4", { status: "待審", categoryName: "自然與科學冷知識", domain: "知識", difficulty: 4 }),
  ];

  it("預設（不傳 filter）只回傳上架題目", () => {
    const result = filterHostCardQuestions(bank);
    expect(result.map((q) => q.id)).toEqual(["Q1", "Q3"]);
  });

  it("傳空物件也只回傳上架題目（includeUnlisted 預設 false）", () => {
    const result = filterHostCardQuestions(bank, {});
    expect(result.map((q) => q.id)).toEqual(["Q1", "Q3"]);
  });

  it("includeUnlisted: true 時包含待審題目", () => {
    const result = filterHostCardQuestions(bank, { includeUnlisted: true });
    expect(result.map((q) => q.id)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });

  it("依題型篩選", () => {
    const result = filterHostCardQuestions(bank, { includeUnlisted: true, categoryName: "法條冷門角落" });
    expect(result.map((q) => q.id)).toEqual(["Q1", "Q2"]);
  });

  it("依難度篩選", () => {
    const result = filterHostCardQuestions(bank, { includeUnlisted: true, difficulty: 4 });
    expect(result.map((q) => q.id)).toEqual(["Q4"]);
  });

  it("題型與難度可以同時篩選，且與上架狀態一起生效", () => {
    const result = filterHostCardQuestions(bank, { categoryName: "自然與科學冷知識", difficulty: 3 });
    expect(result.map((q) => q.id)).toEqual(["Q3"]);
    const empty = filterHostCardQuestions(bank, { categoryName: "自然與科學冷知識", difficulty: 4 }); // Q4 是待審，預設不顯示
    expect(empty).toEqual([]);
  });

  it("空題庫回傳空陣列", () => {
    expect(filterHostCardQuestions([])).toEqual([]);
  });
});

describe("sortHostCardQuestions", () => {
  it("依題型名稱排序，同題型內依難度由小到大排序", () => {
    const bank: Question[] = [
      q("A", { categoryName: "Beta 題型", difficulty: 3 }),
      q("B", { categoryName: "Alpha 題型", difficulty: 5 }),
      q("C", { categoryName: "Alpha 題型", difficulty: 1 }),
    ];
    const sorted = sortHostCardQuestions(bank);
    expect(sorted.map((q) => q.id)).toEqual(["C", "B", "A"]);
  });

  it("不會修改原陣列", () => {
    const bank: Question[] = [q("A", { difficulty: 2 }), q("B", { difficulty: 1 })];
    const sorted = sortHostCardQuestions(bank);
    expect(sorted).not.toBe(bank);
    expect(bank[0].id).toBe("A");
  });
});
