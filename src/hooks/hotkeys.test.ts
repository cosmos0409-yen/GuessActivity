import { describe, expect, it } from "vitest";
import { computeHotkeyAction, isEditableTarget, resolveHotkey, HOTKEY_TABLE } from "./hotkeys";
import { initialState, reducer } from "../state/gameMachine";
import type { GameState } from "../state/gameMachine";
import type { Question } from "../data/types";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    categoryName: "測試題型",
    domain: "知識",
    difficulty: 1,
    text: `題目 ${id}`,
    options: { A: "選項A", B: "選項B", C: "選項C", D: "選項D" },
    correct: "A",
    explanation: "詳解內容",
    status: "上架",
    ...overrides,
  };
}

function setupNewGame(config: Parameters<typeof initialState>[0] = {}): GameState {
  let s = initialState(config);
  s = reducer(s, { type: "ENTER_LOBBY" });
  s = reducer(s, { type: "NEW_GAME", contestantName: "測試員" });
  return s;
}

function setupToCounting(): GameState {
  let s = setupNewGame();
  s = reducer(s, { type: "PICK_CATEGORY", question: q("Q1") });
  s = reducer(s, { type: "START" });
  return s;
}

describe("resolveHotkey", () => {
  it("Space 對應 toggleCountdown", () => {
    expect(resolveHotkey({ key: " ", code: "Space" })).toEqual({ id: "toggleCountdown" });
  });

  it("數字 1-4 對應選項 A-D", () => {
    expect(resolveHotkey({ key: "1" })).toEqual({ id: "selectOption", option: "A" });
    expect(resolveHotkey({ key: "2" })).toEqual({ id: "selectOption", option: "B" });
    expect(resolveHotkey({ key: "3" })).toEqual({ id: "selectOption", option: "C" });
    expect(resolveHotkey({ key: "4" })).toEqual({ id: "selectOption", option: "D" });
  });

  it("字母 A-D（不分大小寫）對應選項 A-D", () => {
    expect(resolveHotkey({ key: "a" })).toEqual({ id: "selectOption", option: "A" });
    expect(resolveHotkey({ key: "B" })).toEqual({ id: "selectOption", option: "B" });
    expect(resolveHotkey({ key: "c" })).toEqual({ id: "selectOption", option: "C" });
    expect(resolveHotkey({ key: "D" })).toEqual({ id: "selectOption", option: "D" });
  });

  it("Enter 對應鎖定／揭曉", () => {
    expect(resolveHotkey({ key: "Enter" })).toEqual({ id: "lockOrReveal" });
  });

  it("→ 與 PageDown 都對應下一步", () => {
    expect(resolveHotkey({ key: "ArrowRight" })).toEqual({ id: "next" });
    expect(resolveHotkey({ key: "PageDown" })).toEqual({ id: "next" });
  });

  it("H/P/V/R 對應三張提示卡與換題", () => {
    expect(resolveHotkey({ key: "h" })).toEqual({ id: "fiftyRemove" });
    expect(resolveHotkey({ key: "P" })).toEqual({ id: "phoneFriend" });
    expect(resolveHotkey({ key: "v" })).toEqual({ id: "audiencePoll" });
    expect(resolveHotkey({ key: "R" })).toEqual({ id: "replaceQuestion" });
  });

  it("Ctrl+Z 或 Cmd+Z 對應復原，單獨按 Z 不算", () => {
    expect(resolveHotkey({ key: "z", ctrlKey: true })).toEqual({ id: "undo" });
    expect(resolveHotkey({ key: "z", metaKey: true })).toEqual({ id: "undo" });
    expect(resolveHotkey({ key: "z" })).toBeNull();
  });

  it("M/F/? 對應靜音、全螢幕、說明浮層", () => {
    expect(resolveHotkey({ key: "m" })).toEqual({ id: "mute" });
    expect(resolveHotkey({ key: "f" })).toEqual({ id: "fullscreen" });
    expect(resolveHotkey({ key: "?" })).toEqual({ id: "help" });
  });

  it("不認識的按鍵回傳 null", () => {
    expect(resolveHotkey({ key: "Escape" })).toBeNull();
    expect(resolveHotkey({ key: "9" })).toBeNull();
  });

  it("游標在 input 或 textarea 裡時，任何按鍵都回傳 null", () => {
    expect(resolveHotkey({ key: " ", code: "Space", target: { tagName: "INPUT" } })).toBeNull();
    expect(resolveHotkey({ key: "Enter", target: { tagName: "textarea" } })).toBeNull();
    expect(resolveHotkey({ key: "1", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
  });

  it("游標不在輸入框裡（例如按鈕）時正常生效", () => {
    expect(resolveHotkey({ key: "Enter", target: { tagName: "BUTTON" } })).toEqual({ id: "lockOrReveal" });
  });
});

describe("isEditableTarget", () => {
  it("辨識 input/textarea/contentEditable", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});

describe("HOTKEY_TABLE", () => {
  it("每一項都有 id/display/label/test，且涵蓋規格書列出的 12 個按鍵", () => {
    expect(HOTKEY_TABLE).toHaveLength(12);
    for (const entry of HOTKEY_TABLE) {
      expect(entry.id).toBeTruthy();
      expect(entry.display).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(typeof entry.test).toBe("function");
    }
    const ids = HOTKEY_TABLE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // 沒有重複
  });
});

describe("computeHotkeyAction —— 依 can() 狀態機判斷允許/不允許", () => {
  it("boot 階段：Space 不允許（can(START) 為 false）", () => {
    const s = initialState();
    expect(computeHotkeyAction({ key: " ", code: "Space" }, s)).toBeNull();
  });

  it("questionShown 階段：Space 允許（可以 START）", () => {
    let s = setupNewGame();
    s = reducer(s, { type: "PICK_CATEGORY", question: q("Q1") });
    expect(s.phase).toBe("questionShown");
    expect(computeHotkeyAction({ key: " ", code: "Space" }, s)).toEqual({ id: "toggleCountdown" });
  });

  it("counting 階段：選項鍵允許，Enter 在尚未選答時不允許（can(LOCK) 需要 selected）", () => {
    const s = setupToCounting();
    expect(computeHotkeyAction({ key: "1" }, s)).toEqual({ id: "selectOption", option: "A" });
    expect(computeHotkeyAction({ key: "Enter" }, s)).toBeNull();
  });

  it("選答後 Enter 允許鎖定；鎖定後 Enter 允許揭曉", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "SELECT", option: "A" });
    expect(computeHotkeyAction({ key: "Enter" }, s)).toEqual({ id: "lockOrReveal" });
    s = reducer(s, { type: "LOCK" });
    expect(s.phase).toBe("locked");
    expect(computeHotkeyAction({ key: "Enter" }, s)).toEqual({ id: "lockOrReveal" });
  });

  it("pickCategory 階段：提示卡與換題都不允許（提示卡只能在題目出現後使用，換題需要有題目）", () => {
    const s = setupNewGame();
    expect(s.phase).toBe("pickCategory");
    expect(computeHotkeyAction({ key: "h" }, s)).toBeNull();
    expect(computeHotkeyAction({ key: "p" }, s)).toBeNull();
    expect(computeHotkeyAction({ key: "v" }, s)).toBeNull();
    expect(computeHotkeyAction({ key: "r" }, s)).toBeNull();
  });

  it("counting 階段：三張提示卡都允許使用（尚未用過）", () => {
    const s = setupToCounting();
    expect(computeHotkeyAction({ key: "h" }, s)).toEqual({ id: "fiftyRemove" });
    expect(computeHotkeyAction({ key: "p" }, s)).toEqual({ id: "phoneFriend" });
    expect(computeHotkeyAction({ key: "v" }, s)).toEqual({ id: "audiencePoll" });
  });

  it("用過的提示卡再按同一個鍵不再允許", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "USE_FIFTY_REMOVE", option: "B" });
    expect(computeHotkeyAction({ key: "h" }, s)).toBeNull();
  });

  it("沒有歷史紀錄時 Ctrl+Z 不允許；操作過一步之後允許", () => {
    const boot = initialState();
    expect(computeHotkeyAction({ key: "z", ctrlKey: true }, boot)).toBeNull();
    const afterOneStep = reducer(boot, { type: "ENTER_LOBBY" });
    expect(computeHotkeyAction({ key: "z", ctrlKey: true }, afterOneStep)).toEqual({ id: "undo" });
  });

  it("mute/fullscreen/help 不受狀態機限制，任何 phase 都允許", () => {
    const boot = initialState();
    expect(computeHotkeyAction({ key: "m" }, boot)).toEqual({ id: "mute" });
    expect(computeHotkeyAction({ key: "f" }, boot)).toEqual({ id: "fullscreen" });
    expect(computeHotkeyAction({ key: "?" }, boot)).toEqual({ id: "help" });
  });

  it("游標在輸入框裡時，即使狀態允許也整個忽略（不會回傳任何動作）", () => {
    const s = setupToCounting();
    expect(computeHotkeyAction({ key: "1", target: { tagName: "INPUT" } }, s)).toBeNull();
    expect(computeHotkeyAction({ key: "m", target: { tagName: "TEXTAREA" } }, s)).toBeNull();
  });

  it("explanation 階段：下一步允許（NEXT）；revealed 階段：下一步允許（SHOW_EXPLANATION）", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "SELECT", option: "A" });
    s = reducer(s, { type: "LOCK" });
    s = reducer(s, { type: "REVEAL" });
    expect(s.phase).toBe("revealed");
    expect(computeHotkeyAction({ key: "ArrowRight" }, s)).toEqual({ id: "next" });
    s = reducer(s, { type: "SHOW_EXPLANATION" });
    expect(s.phase).toBe("explanation");
    expect(computeHotkeyAction({ key: "PageDown" }, s)).toEqual({ id: "next" });
  });

  it("levelCleared 階段：下一步不允許（NEXT/SHOW_EXPLANATION 都不合法）", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "SELECT", option: "A" });
    s = reducer(s, { type: "LOCK" });
    s = reducer(s, { type: "REVEAL" });
    s = reducer(s, { type: "SHOW_EXPLANATION" });
    s = reducer(s, { type: "NEXT" });
    expect(s.phase).toBe("levelCleared");
    expect(computeHotkeyAction({ key: "ArrowRight" }, s)).toBeNull();
  });
});
