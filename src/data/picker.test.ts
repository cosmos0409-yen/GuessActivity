import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCategoriesCsv, parseQuestionsCsv } from "./questionSource";
import { availability, drawQuestion, normalizeCategoryName, pickRemovableOption, stripLeadingEmoji } from "./picker";
import type { Question, QuestionBank } from "./types";

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

// U+FE0F：emoji 變體選擇符，例如「⚖️」實際上是 U+2696（天秤符號）+ U+FE0F 兩個碼位組成。
// 用 String.fromCodePoint 明確組字，避免依賴編輯器/檔案編碼是否保留看不見的變體選擇符。
const SCALES = String.fromCodePoint(0x2696); // ⚖（不含變體選擇符）
const VS16 = String.fromCodePoint(0xfe0f); // 變體選擇符本身
const SCALES_EMOJI = SCALES + VS16; // ⚖️（含變體選擇符，CSV 裡常見的寫法）
const CATEGORY_WITH_VS16 = `${SCALES_EMOJI} 憲法法庭與實務`;
const CATEGORY_WITHOUT_VS16 = `${SCALES} 憲法法庭與實務`;

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    categoryName: CATEGORY_WITH_VS16,
    domain: "法律",
    difficulty: 1,
    text: "題目",
    options: { A: "A", B: "B", C: "C", D: "D" },
    correct: "A",
    explanation: "詳解",
    status: "上架",
    ...overrides,
  };
}

describe("normalizeCategoryName", () => {
  it("去除前後空白", () => {
    expect(normalizeCategoryName("  憲法法庭與實務  ")).toBe("憲法法庭與實務");
  });

  it("去除 U+FE0F 變體選擇符，讓帶emoji變體符號與不帶的名稱視為同一個題型", () => {
    expect(normalizeCategoryName(CATEGORY_WITH_VS16)).toBe(CATEGORY_WITHOUT_VS16);
    expect(normalizeCategoryName(CATEGORY_WITHOUT_VS16)).toBe(CATEGORY_WITHOUT_VS16);
  });
});

describe("stripLeadingEmoji", () => {
  it("去掉開頭的 emoji 與後面的空白，只用於顯示", () => {
    expect(stripLeadingEmoji("📕 法條冷門角落")).toBe("法條冷門角落");
    expect(stripLeadingEmoji(CATEGORY_WITH_VS16)).toBe("憲法法庭與實務");
  });

  it("名稱沒有開頭 emoji 時原樣傳回", () => {
    expect(stripLeadingEmoji("法條冷門角落")).toBe("法條冷門角落");
  });

  it("名稱整個都是 emoji（沒有文字）時，安全回傳原字串，不會變成空白", () => {
    expect(stripLeadingEmoji("📕")).toBe("📕");
  });
});

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

  it("題型名稱帶變體選擇符（例如「⚖️」）時，用不帶變體選擇符的名稱查詢也能抽到題（回歸測試：問題1）", () => {
    const bank: QuestionBank = {
      questions: [makeQuestion({ id: "L06", categoryName: CATEGORY_WITH_VS16 })],
      categories: [{ name: CATEGORY_WITH_VS16, domain: "法律", icon: "⚖️", color: "#E5161B", enabled: true }],
      source: "bundled",
      fetchedAt: new Date().toISOString(),
      warnings: [],
    };

    // 題目的 categoryName 帶 U+FE0F，用完全一致的名稱查詢要能抽到
    const withSelector = drawQuestion(bank, { category: CATEGORY_WITH_VS16, difficulty: 1, usedIds: [] });
    expect(withSelector?.id).toBe("L06");

    // 用不帶 U+FE0F 的名稱去查也要能抽到同一題，不能因為變體選擇符有無不同而找不到
    const withoutSelector = drawQuestion(bank, { category: CATEGORY_WITHOUT_VS16, difficulty: 1, usedIds: [] });
    expect(withoutSelector?.id).toBe("L06");
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

  it("題型名稱帶變體選擇符時，計數要用正規化後的名稱查得到（回歸測試：問題1）", () => {
    const bank: QuestionBank = {
      questions: [makeQuestion({ id: "L06", categoryName: CATEGORY_WITH_VS16 })],
      categories: [{ name: CATEGORY_WITH_VS16, domain: "法律", icon: "⚖️", color: "#E5161B", enabled: true }],
      source: "bundled",
      fetchedAt: new Date().toISOString(),
      warnings: [],
    };
    const stats = availability(bank, []);
    // 不管用帶不帶變體選擇符的名稱去正規化查詢，結果都要是同一個 key
    expect(stats[normalizeCategoryName(CATEGORY_WITH_VS16)][1]).toBe(1);
    expect(stats[normalizeCategoryName(CATEGORY_WITHOUT_VS16)][1]).toBe(1);
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
