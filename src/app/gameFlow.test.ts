import { beforeEach, describe, expect, it } from "vitest";
import { drawQuestionForRound, makeRoundId, makeSessionId } from "./gameFlow";
import { getUsedIds, resetUsed } from "../data/usedStore";
import type { QuestionBank } from "../data/types";

function makeBank(): QuestionBank {
  return {
    source: "bundled",
    fetchedAt: new Date().toISOString(),
    warnings: [],
    categories: [
      { name: "法條冷門角落", domain: "法律", icon: "📕", color: "#057833", enabled: true },
    ],
    questions: [
      {
        id: "L01",
        categoryName: "法條冷門角落",
        domain: "法律",
        difficulty: 1,
        text: "題目一",
        options: { A: "a", B: "b", C: "c", D: "d" },
        correct: "A",
        explanation: "解釋一",
        status: "上架",
      },
      {
        id: "L02",
        categoryName: "法條冷門角落",
        domain: "法律",
        difficulty: 1,
        text: "題目二",
        options: { A: "a", B: "b", C: "c", D: "d" },
        correct: "B",
        explanation: "解釋二",
        status: "上架",
      },
    ],
  };
}

// localStorage polyfill：測試環境是 "node"，沒有原生 localStorage
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  resetUsed();
});

describe("drawQuestionForRound", () => {
  it("抽到題目時，非彩排模式會寫回 usedStore", () => {
    const bank = makeBank();
    const q = drawQuestionForRound({
      bank,
      category: "法條冷門角落",
      difficulty: 1,
      rehearsal: false,
      rng: () => 0,
    });
    expect(q?.id).toBe("L01");
    expect(getUsedIds().has("L01")).toBe(true);
  });

  it("彩排模式抽到題目後不會寫回 usedStore", () => {
    const bank = makeBank();
    const q = drawQuestionForRound({
      bank,
      category: "法條冷門角落",
      difficulty: 1,
      rehearsal: true,
      rng: () => 0,
    });
    expect(q?.id).toBe("L01");
    expect(getUsedIds().size).toBe(0);
  });

  it("排除 usedStore 裡已經記錄過的題目", () => {
    const bank = makeBank();
    drawQuestionForRound({ bank, category: "法條冷門角落", difficulty: 1, rehearsal: false, rng: () => 0 });
    // 第二次抽，L01 已經在 usedStore，應該抽到 L02
    const second = drawQuestionForRound({
      bank,
      category: "法條冷門角落",
      difficulty: 1,
      rehearsal: false,
      rng: () => 0,
    });
    expect(second?.id).toBe("L02");
  });

  it("也會排除本場 sessionUsedIds（即使 usedStore 還沒寫入，例如彩排模式）", () => {
    const bank = makeBank();
    const first = drawQuestionForRound({
      bank,
      category: "法條冷門角落",
      difficulty: 1,
      rehearsal: true,
      rng: () => 0,
    });
    expect(first?.id).toBe("L01");
    const second = drawQuestionForRound({
      bank,
      category: "法條冷門角落",
      difficulty: 1,
      rehearsal: true,
      sessionUsedIds: [first!.id],
      rng: () => 0,
    });
    expect(second?.id).toBe("L02");
  });

  it("找不到符合條件的題目時回傳 null，且不寫入 usedStore", () => {
    const bank = makeBank();
    const q = drawQuestionForRound({
      bank,
      category: "不存在的題型",
      difficulty: 1,
      rehearsal: false,
      rng: () => 0,
    });
    expect(q).toBeNull();
    expect(getUsedIds().size).toBe(0);
  });

  it("同一題型不同難度沒有題目時回傳 null", () => {
    const bank = makeBank();
    const q = drawQuestionForRound({
      bank,
      category: "法條冷門角落",
      difficulty: 5,
      rehearsal: false,
    });
    expect(q).toBeNull();
  });
});

describe("makeSessionId / makeRoundId", () => {
  it("makeSessionId 產生 yyyymmdd-HHMMSS 格式", () => {
    const id = makeSessionId(new Date(2026, 8, 11, 9, 5, 3));
    expect(id).toBe("20260911-090503");
  });

  it("makeRoundId 組成 場次-關卡-題號", () => {
    expect(makeRoundId("20260911-090503", 3, "L01")).toBe("20260911-090503-3-L01");
  });
});
