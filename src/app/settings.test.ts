import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RULE_SETTINGS, loadRuleSettings, saveRuleSettings } from "./settings";

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

describe("settings（規則設定）", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
  });

  it("沒有存過設定時回傳預設值", () => {
    expect(loadRuleSettings()).toEqual(DEFAULT_RULE_SETTINGS);
  });

  it("存了設定之後讀回一樣的內容", () => {
    saveRuleSettings({ seconds: 45, timeoutPolicy: "host", rehearsal: true });
    expect(loadRuleSettings()).toEqual({ seconds: 45, timeoutPolicy: "host", rehearsal: true });
  });

  it("localStorage 內容是損毀的 JSON 時，整個回退到預設值", () => {
    localStorage.setItem("quiz.settings.rules.v1", "{not-json");
    expect(loadRuleSettings()).toEqual(DEFAULT_RULE_SETTINGS);
  });

  it("內容是 JSON 但不是物件（例如陣列或數字）時回退到預設值", () => {
    localStorage.setItem("quiz.settings.rules.v1", "[1,2,3]");
    expect(loadRuleSettings()).toEqual(DEFAULT_RULE_SETTINGS);
    localStorage.setItem("quiz.settings.rules.v1", "42");
    expect(loadRuleSettings()).toEqual(DEFAULT_RULE_SETTINGS);
  });

  it("個別欄位型別不對時，只有那個欄位退回預設值，其他欄位保留", () => {
    localStorage.setItem(
      "quiz.settings.rules.v1",
      JSON.stringify({ seconds: "很久", timeoutPolicy: "隨便", rehearsal: "是" }),
    );
    expect(loadRuleSettings()).toEqual(DEFAULT_RULE_SETTINGS);
  });

  it("timeoutPolicy 只接受 'wrong' 或 'host'，其他字串視為 'wrong'", () => {
    localStorage.setItem("quiz.settings.rules.v1", JSON.stringify({ timeoutPolicy: "其他" }));
    expect(loadRuleSettings().timeoutPolicy).toBe("wrong");
  });

  it("localStorage 不存在時（例如私密瀏覽）不會丟出例外", () => {
    delete (globalThis as any).localStorage;
    expect(() => loadRuleSettings()).not.toThrow();
    expect(() => saveRuleSettings(DEFAULT_RULE_SETTINGS)).not.toThrow();
  });
});
