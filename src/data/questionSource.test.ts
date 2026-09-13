import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  STORAGE_KEYS,
  loadQuestionBank,
  parseCategoriesCsv,
  parseQuestionsCsv,
  setRemoteUrls,
} from "./questionSource";

function readFixture(name: string): string {
  const url = new URL(`./__fixtures__/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

// --- 簡易 localStorage mock（測試環境是 node，沒有內建 localStorage） -------

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

describe("parseQuestionsCsv", () => {
  it("表頭順序不同、欄位齊全時可以正確解析全部題目，且沒有警告", () => {
    const csv = readFixture("questions-basic.csv");
    const { questions, warnings } = parseQuestionsCsv(csv);
    expect(questions).toHaveLength(5);
    expect(warnings).toHaveLength(0);
  });

  it("不合格的列會被跳過並收集成 warnings，不會讓整體解析失敗", () => {
    const csv = readFixture("questions-invalid.csv");
    const { questions, warnings } = parseQuestionsCsv(csv);
    // 只有 q_ok 與第一筆 q_dup 合格
    expect(questions.map((q) => q.id)).toEqual(["q_ok", "q_dup"]);
    expect(warnings.length).toBeGreaterThanOrEqual(9);
    // 每筆警告都要有列號與原因
    for (const w of warnings) {
      expect(typeof w.row).toBe("number");
      expect(w.reason.length).toBeGreaterThan(0);
    }
  });

  it("待審題目仍會被解析出來（由抽題邏輯負責排除）", () => {
    const csv = readFixture("questions-basic.csv");
    const { questions } = parseQuestionsCsv(csv);
    const q3 = questions.find((q) => q.id === "q3");
    expect(q3?.status).toBe("待審");
  });
});

describe("parseCategoriesCsv", () => {
  it("解析題型並套用「啟用」欄位空白視為是的規則", () => {
    const csv = readFixture("categories-basic.csv");
    const { categories, warnings } = parseCategoriesCsv(csv);
    expect(warnings).toHaveLength(0);
    expect(categories).toHaveLength(3);
    const empty = categories.find((c) => c.name === "自然與科學冷知識");
    expect(empty?.enabled).toBe(true);
    const off = categories.find((c) => c.name === "停用題型");
    expect(off?.enabled).toBe(false);
  });

  it("不合格的題型列會被跳過並收集成 warnings", () => {
    const csv = readFixture("categories-invalid.csv");
    const { categories, warnings } = parseCategoriesCsv(csv);
    expect(categories).toHaveLength(0);
    expect(warnings).toHaveLength(3);
  });
});

describe("loadQuestionBank", () => {
  const bundledQuestionsCsv = readFixture("questions-basic.csv");
  const bundledCategoriesCsv = readFixture("categories-basic.csv");

  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("遠端成功時來源標記 remote，並把內容寫入本機快取", async () => {
    setRemoteUrls("https://example.com/questions.csv", "https://example.com/categories.csv");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("questions")) {
        return { ok: true, text: async () => bundledQuestionsCsv } as Response;
      }
      return { ok: true, text: async () => bundledCategoriesCsv } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const bank = await loadQuestionBank();
    expect(bank.source).toBe("remote");
    expect(bank.questions.length).toBeGreaterThan(0);
    expect(localStorage.getItem(STORAGE_KEYS.cachedQuestionsCsv)).toBe(bundledQuestionsCsv);
    expect(localStorage.getItem(STORAGE_KEYS.cachedFetchedAt)).toBeTruthy();
  });

  it("遠端失敗但有本機快取時，退回快取，來源標記 cache", async () => {
    localStorage.setItem(STORAGE_KEYS.cachedQuestionsCsv, bundledQuestionsCsv);
    localStorage.setItem(STORAGE_KEYS.cachedCategoriesCsv, bundledCategoriesCsv);
    localStorage.setItem(STORAGE_KEYS.cachedFetchedAt, "2026-01-01T00:00:00.000Z");
    setRemoteUrls("https://example.com/questions.csv", "https://example.com/categories.csv");

    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const bank = await loadQuestionBank();
    expect(bank.source).toBe("cache");
    expect(bank.fetchedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("遠端失敗且沒有快取時，退回內建範例題庫，來源標記 bundled", async () => {
    setRemoteUrls("https://example.com/questions.csv", "https://example.com/categories.csv");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("example.com")) {
        throw new Error("network down");
      }
      // 內建範例題庫的路徑請求
      if (url.includes("sample-questions.csv")) {
        return { ok: true, text: async () => bundledQuestionsCsv } as Response;
      }
      return { ok: true, text: async () => bundledCategoriesCsv } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const bank = await loadQuestionBank();
    expect(bank.source).toBe("bundled");
    expect(bank.questions.length).toBeGreaterThan(0);
  });

  it("fetch 逾時時也會依序退回快取／內建題庫", async () => {
    localStorage.setItem(STORAGE_KEYS.cachedQuestionsCsv, bundledQuestionsCsv);
    localStorage.setItem(STORAGE_KEYS.cachedCategoriesCsv, bundledCategoriesCsv);
    setRemoteUrls("https://example.com/questions.csv", "https://example.com/categories.csv");

    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const bank = await loadQuestionBank({ timeoutMs: 20 });
    expect(bank.source).toBe("cache");
  });
});
