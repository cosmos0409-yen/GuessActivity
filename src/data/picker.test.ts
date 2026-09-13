import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCategoriesCsv, parseQuestionsCsv } from "./questionSource";
import { availability, drawQuestion, pickRemovableOption } from "./picker";
import type { QuestionBank } from "./types";

function readFixture(name: string): string {
  const url = new URL(`./__fixtures__/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function buildBank(): QuestionBank {
  const { questions } = parseQuestionsCsv(readFixture("questions-basic.csv"));
  const { categories } = parseCategoriesCsv(readFixture("categories-basic.csv"));
  return {
    questions,
    categories,
    source: "bundled",
    fetchedAt: new Date().toISOString(),
    warnings: [],
  };
}

describe("drawQuestion", () => {
  it("待審題不會被抽到", () => {
    const bank = buildBank();
    // q3 是「法條冷門角落」難度 2 的唯一一題，且狀態是待審
    const result = drawQuestion(bank, { category: "法條冷門角落", difficulty: 2, usedIds: [] });
    expect(result).toBeNull();
  });

  it("用過的題目不會重複抽到", () => {
    const bank = buildBank();
    const rng = () => 0; // 固定選第一個候選
    const first = drawQuestion(bank, { category: "法條冷門角落", difficulty: 1, usedIds: [], rng });
    expect(first).not.toBeNull();

    const usedIds = new Set([first!.id]);
    const second = drawQuestion(bank, { category: "法條冷門角落", difficulty: 1, usedIds, rng });
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);

    // 兩題都用掉後，同一個題型難度應該抽不到題目了
    usedIds.add(second!.id);
    const third = drawQuestion(bank, { category: "法條冷門角落", difficulty: 1, usedIds, rng });
    expect(third).toBeNull();
  });

  it("某個題型 × 難度沒有題目時回傳 null", () => {
    const bank = buildBank();
    const result = drawQuestion(bank, { category: "法條冷門角落", difficulty: 5, usedIds: [] });
    expect(result).toBeNull();
  });

  it("只會抽出符合題型與難度的題目", () => {
    const bank = buildBank();
    for (let i = 0; i < 10; i++) {
      const q = drawQuestion(bank, {
        category: "自然與科學冷知識",
        difficulty: 1,
        usedIds: [],
        rng: () => i / 10,
      });
      expect(q).not.toBeNull();
      expect(q!.categoryName).toBe("自然與科學冷知識");
      expect(q!.difficulty).toBe(1);
    }
  });
});

describe("availability", () => {
  it("計數正確：只算上架且未使用的題目", () => {
    const bank = buildBank();
    const stats = availability(bank, []);

    // 法條冷門角落：difficulty1 有 2 題上架（q1,q2），difficulty2 有 1 題但待審 -> 0
    expect(stats["法條冷門角落"][1]).toBe(2);
    expect(stats["法條冷門角落"][2]).toBe(0);
    expect(stats["法條冷門角落"][5]).toBe(0);

    // 自然與科學冷知識：difficulty1 有 2 題上架（q4,q5）
    expect(stats["自然與科學冷知識"][1]).toBe(2);
  });

  it("標記已使用後，計數會減少", () => {
    const bank = buildBank();
    const stats = availability(bank, ["q1"]);
    expect(stats["法條冷門角落"][1]).toBe(1);
  });
});

describe("pickRemovableOption", () => {
  it("優先使用題庫的「刪除選項優先」欄位", () => {
    const bank = buildBank();
    const q4 = bank.questions.find((q) => q.id === "q4")!;
    expect(q4.removalPriority).toBe("B");
    const removed = pickRemovableOption(q4, () => 0.999);
    expect(removed).toBe("B");
  });

  it("沒有指定刪除選項優先時，從錯誤選項中隨機挑一個，且永遠不會刪到正解", () => {
    const bank = buildBank();
    const q5 = bank.questions.find((q) => q.id === "q5")!; // 正解是 C，沒有 removalPriority
    expect(q5.removalPriority).toBeUndefined();

    for (let i = 0; i < 20; i++) {
      const removed = pickRemovableOption(q5, () => i / 20);
      expect(removed).not.toBe(q5.correct);
      expect(["A", "B", "D"]).toContain(removed);
    }
  });
});
