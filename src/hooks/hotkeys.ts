// 快捷鍵對照表與純判斷邏輯（不依賴 DOM／React，方便窮舉測試）。
//
// 設計原則：
//   - HOTKEY_TABLE 是唯一事實來源：按鍵判斷（resolveHotkey）與快捷鍵說明浮層
//     都從這個常數產生，不要在別的地方重複列一份按鍵對照表。
//   - computeHotkeyAction() 把「這個按鍵在目前狀態下該不該生效」的判斷
//     （含 can() 狀態機檢查、游標在輸入框裡要忽略）都收在這裡，
//     是一個純函式，方便窮舉測試每個按鍵在允許/不允許狀態下的行為。
//   - mute／fullscreen／說明浮層不是狀態機的 action，不受 can() 限制，
//     只要游標不在輸入框裡就一律允許。

import { can, type GameAction, type GameState } from "../state/gameMachine";
import type { OptionKey } from "../data/types";

export type HotkeyId =
  | "toggleCountdown"
  | "selectOption"
  | "lockOrReveal"
  | "next"
  | "fiftyRemove"
  | "phoneFriend"
  | "audiencePoll"
  | "replaceQuestion"
  | "undo"
  | "mute"
  | "fullscreen"
  | "help";

/** 讓 resolveHotkey() 可以吃真的 KeyboardEvent（target 是 DOM 的 EventTarget），也可以吃測試用的最小物件。 */
export interface HotkeyInputEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: unknown;
}

export interface HotkeyMatch {
  id: HotkeyId;
  /** 只有 id === "selectOption" 時才有值 */
  option?: OptionKey;
}

export interface HotkeyTableEntry {
  id: HotkeyId;
  /** 顯示在說明浮層的按鍵樣式 */
  display: string;
  /** 顯示在說明浮層的功能說明 */
  label: string;
  test: (e: HotkeyInputEvent) => boolean;
}

const OPTION_KEY_MAP: Record<string, OptionKey> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D",
  a: "A",
  b: "B",
  c: "C",
  d: "D",
};

/** 唯一事實來源：按鍵判斷與說明浮層都從這裡產生。 */
export const HOTKEY_TABLE: HotkeyTableEntry[] = [
  {
    id: "toggleCountdown",
    display: "Space",
    label: "暫停／恢復倒數",
    test: (e) => e.key === " " || e.code === "Space",
  },
  {
    id: "selectOption",
    display: "1–4 ／ A–D",
    label: "選答案",
    test: (e) => e.key.length === 1 && Object.prototype.hasOwnProperty.call(OPTION_KEY_MAP, e.key.toLowerCase()),
  },
  {
    id: "lockOrReveal",
    display: "Enter",
    label: "鎖定答案／揭曉結果",
    test: (e) => e.key === "Enter",
  },
  {
    id: "next",
    display: "→ ／ PageDown",
    label: "下一步（含收起詳解卡）",
    test: (e) => e.key === "ArrowRight" || e.key === "PageDown",
  },
  {
    id: "fiftyRemove",
    display: "H",
    label: "提示卡：刪除一個選項",
    test: (e) => e.key.toLowerCase() === "h",
  },
  {
    id: "phoneFriend",
    display: "P",
    label: "提示卡：指定人幫幫忙",
    test: (e) => e.key.toLowerCase() === "p",
  },
  {
    id: "audiencePoll",
    display: "V",
    label: "提示卡：全場一起協助",
    test: (e) => e.key.toLowerCase() === "v",
  },
  {
    id: "replaceQuestion",
    display: "R",
    label: "換題（會先跳出確認）",
    test: (e) => e.key.toLowerCase() === "r",
  },
  {
    id: "undo",
    display: "Ctrl+Z",
    label: "復原上一步",
    test: (e) => (e.ctrlKey === true || e.metaKey === true) && e.key.toLowerCase() === "z",
  },
  {
    id: "mute",
    display: "M",
    label: "靜音／取消靜音",
    test: (e) => e.key.toLowerCase() === "m",
  },
  {
    id: "fullscreen",
    display: "F",
    label: "切換全螢幕",
    test: (e) => e.key.toLowerCase() === "f",
  },
  {
    id: "help",
    display: "?",
    label: "顯示／關閉這份快捷鍵說明",
    test: (e) => e.key === "?",
  },
];

/** 游標是否在輸入框（input/textarea）或可編輯內容裡；這種情況下所有快捷鍵都要忽略。 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : undefined;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

/**
 * 依 HOTKEY_TABLE 依序比對，回傳第一個命中的按鍵（含選項字母的解析）；
 * 游標在輸入框裡，或沒有任何按鍵命中時回傳 null。
 */
export function resolveHotkey(e: HotkeyInputEvent): HotkeyMatch | null {
  if (isEditableTarget(e.target)) return null;
  for (const entry of HOTKEY_TABLE) {
    if (entry.test(e)) {
      if (entry.id === "selectOption") {
        const option = OPTION_KEY_MAP[e.key.toLowerCase()];
        return option ? { id: "selectOption", option } : null;
      }
      return { id: entry.id };
    }
  }
  return null;
}

/**
 * 把 HotkeyId 對應到狀態機要 can() 檢查的 action type；
 * 只要其中一個 can() 允許就算允許。mute/fullscreen/help 不對應任何 action，一律允許。
 */
const GATING_ACTIONS: Partial<Record<HotkeyId, Array<GameAction["type"]>>> = {
  toggleCountdown: ["START", "PAUSE", "RESUME"],
  selectOption: ["SELECT"],
  lockOrReveal: ["LOCK", "REVEAL"],
  next: ["SHOW_EXPLANATION", "NEXT"],
  fiftyRemove: ["USE_FIFTY_REMOVE"],
  phoneFriend: ["USE_PHONE_FRIEND"],
  audiencePoll: ["USE_AUDIENCE_POLL"],
  replaceQuestion: ["REPLACE_QUESTION"],
  undo: ["UNDO"],
};

/** 這個按鍵在目前狀態下允不允許生效。 */
export function isHotkeyAllowed(id: HotkeyId, state: GameState): boolean {
  const actions = GATING_ACTIONS[id];
  if (!actions) return true;
  return actions.some((type) => can(state, type));
}

/**
 * 把「解析出來的按鍵」與「目前狀態允不允許」合在一起判斷。
 * 回傳 null 表示這次按鍵完全不生效（呼叫端不需要 preventDefault，也不需要做任何事）。
 */
export function computeHotkeyAction(e: HotkeyInputEvent, state: GameState): HotkeyMatch | null {
  const match = resolveHotkey(e);
  if (!match) return null;
  if (!isHotkeyAllowed(match.id, state)) return null;
  return match;
}
