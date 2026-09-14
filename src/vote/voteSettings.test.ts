import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_VOTE_SETTINGS, loadVoteSettings, saveVoteSettings } from "./voteSettings";

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

describe("voteSettings", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
  });

  it("沒有存過任何設定時回傳預設值", () => {
    expect(loadVoteSettings()).toEqual(DEFAULT_VOTE_SETTINGS);
  });

  it("存了設定之後讀回一樣的內容", () => {
    saveVoteSettings({
      formUrl: "https://forms.gle/xxx?entry={round}",
      statsUrl: "https://script.google.com/macros/s/yyy/exec",
      intervalMs: 3000,
      enabled: true,
    });
    expect(loadVoteSettings()).toEqual({
      formUrl: "https://forms.gle/xxx?entry={round}",
      statsUrl: "https://script.google.com/macros/s/yyy/exec",
      intervalMs: 3000,
      enabled: true,
    });
  });

  it("預設就是正式的表單與統計網址，而且啟用線上投票", () => {
    expect(DEFAULT_VOTE_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_VOTE_SETTINGS.formUrl).toContain("{round}");
    expect(DEFAULT_VOTE_SETTINGS.statsUrl).toMatch(/^https:\/\/script\.google\.com\//);
  });

  it("舊版存下的空白網址（從來沒有設定過）會改用內建的正式設定", () => {
    saveVoteSettings({ formUrl: "", statsUrl: "", intervalMs: 2000, enabled: false });
    expect(loadVoteSettings()).toEqual(DEFAULT_VOTE_SETTINGS);
  });

  it("localStorage 內容毀損時回傳預設值而不是丟出例外", () => {
    localStorage.setItem("quiz.vote.settings.v1", "{not-json");
    expect(loadVoteSettings()).toEqual(DEFAULT_VOTE_SETTINGS);
  });

  it("localStorage 不存在時（例如私密瀏覽）不會丟出例外", () => {
    delete (globalThis as any).localStorage;
    expect(() => loadVoteSettings()).not.toThrow();
    expect(() => saveVoteSettings(DEFAULT_VOTE_SETTINGS)).not.toThrow();
  });
});
