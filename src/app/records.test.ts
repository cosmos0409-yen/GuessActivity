import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendRecord,
  buildRecordsCsv,
  clearRecords,
  loadRecords,
  sortLeaderboard,
} from "./records";
import type { GameRecord } from "../state/gameMachine";

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

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    contestantName: "測試員",
    levels: [{ level: 1, questionId: "Q1", categoryName: "測試題型", selected: "A", correct: true, lifelinesUsed: [] }],
    lifelinesUsed: [],
    result: "champion",
    clearedLevels: 5,
    rewardLevel: 5,
    timestamp: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("records —— 本機儲存", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
  });

  it("沒有紀錄時回傳空陣列", () => {
    expect(loadRecords()).toEqual([]);
  });

  it("appendRecord 會累加並持久化", () => {
    appendRecord(record({ contestantName: "小明" }));
    appendRecord(record({ contestantName: "小華" }));
    const loaded = loadRecords();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((r) => r.contestantName)).toEqual(["小明", "小華"]);
  });

  it("clearRecords 清空全部紀錄", () => {
    appendRecord(record());
    clearRecords();
    expect(loadRecords()).toEqual([]);
  });

  it("localStorage 內容毀損時回傳空陣列而不丟出例外", () => {
    localStorage.setItem("quiz.records.v1", "{not-json");
    expect(loadRecords()).toEqual([]);
  });

  it("localStorage 內容不是陣列，或陣列裡混了不像 GameRecord 的項目時會過濾掉", () => {
    localStorage.setItem("quiz.records.v1", JSON.stringify({ foo: "bar" }));
    expect(loadRecords()).toEqual([]);

    localStorage.setItem("quiz.records.v1", JSON.stringify([record(), { junk: true }, 123, null]));
    expect(loadRecords()).toHaveLength(1);
  });

  it("localStorage 不存在時不會丟出例外", () => {
    delete (globalThis as any).localStorage;
    expect(() => loadRecords()).not.toThrow();
    expect(() => appendRecord(record())).not.toThrow();
    expect(() => clearRecords()).not.toThrow();
  });
});

describe("sortLeaderboard —— 排行榜排序", () => {
  it("依通過關數多寡排序，關數多的排前面", () => {
    const records = [record({ contestantName: "A", clearedLevels: 2 }), record({ contestantName: "B", clearedLevels: 5 })];
    expect(sortLeaderboard(records).map((r) => r.contestantName)).toEqual(["B", "A"]);
  });

  it("關數相同時，使用提示卡數較少的排前面", () => {
    const records = [
      record({ contestantName: "用很多卡", clearedLevels: 3, lifelinesUsed: ["fiftyRemove", "phoneFriend", "audiencePoll"] }),
      record({ contestantName: "沒用卡", clearedLevels: 3, lifelinesUsed: [] }),
      record({ contestantName: "用一張卡", clearedLevels: 3, lifelinesUsed: ["fiftyRemove"] }),
    ];
    expect(sortLeaderboard(records).map((r) => r.contestantName)).toEqual(["沒用卡", "用一張卡", "用很多卡"]);
  });

  it("關數與提示卡數都相同時，較新的場次排前面", () => {
    const records = [
      record({ contestantName: "較早", clearedLevels: 3, timestamp: "2026-01-01T00:00:00.000Z" }),
      record({ contestantName: "較晚", clearedLevels: 3, timestamp: "2026-06-01T00:00:00.000Z" }),
    ];
    expect(sortLeaderboard(records).map((r) => r.contestantName)).toEqual(["較晚", "較早"]);
  });

  it("不會修改原陣列（回傳新陣列）", () => {
    const records = [record({ clearedLevels: 1 }), record({ clearedLevels: 5 })];
    const sorted = sortLeaderboard(records);
    expect(sorted).not.toBe(records);
    expect(records[0].clearedLevels).toBe(1); // 原陣列順序不變
  });
});

describe("buildRecordsCsv —— CSV 匯出", () => {
  it("開頭有 UTF-8 BOM", () => {
    const csv = buildRecordsCsv([record()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("包含表頭與參賽者、結果、通過關數等欄位", () => {
    const csv = buildRecordsCsv([record({ contestantName: "小明", clearedLevels: 4, result: "gameOver" })]);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("參賽者,時間,結果,通過關數,使用的提示卡,各關題號與作答");
    expect(lines[1]).toContain("小明");
    expect(lines[1]).toContain("答錯出局");
    expect(lines[1]).toContain("4");
  });

  it("沒有紀錄時只有表頭一行（加上 BOM）", () => {
    const csv = buildRecordsCsv([]);
    expect(csv).toBe("﻿參賽者,時間,結果,通過關數,使用的提示卡,各關題號與作答");
  });

  it("使用的提示卡會轉成中文名稱、用「、」分隔", () => {
    const csv = buildRecordsCsv([record({ lifelinesUsed: ["fiftyRemove", "audiencePoll"] })]);
    expect(csv).toContain("刪除一個選項、全場一起協助");
  });

  it("欄位內容含逗號或換行時會被雙引號包起來", () => {
    const csv = buildRecordsCsv([record({ contestantName: "隊名, 有逗號" })]);
    expect(csv).toContain('"隊名, 有逗號"');
  });
});
