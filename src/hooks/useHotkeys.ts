// 快捷鍵 hook：接上 window 的 keydown 事件，把判斷邏輯全部委派給 hotkeys.ts 的
// computeHotkeyAction()（純函式，已經包含 can() 狀態機檢查與輸入框忽略）。
// 這個檔案只負責「接 DOM 事件」與「把命中的按鍵分派到對應的 callback」，
// 本身不含任何業務邏輯，所以不特別為它寫依賴 DOM 的測試；邏輯測試都在 hotkeys.test.ts。

import { useEffect, useState } from "react";
import { computeHotkeyAction, type HotkeyId } from "./hotkeys";
import type { GameState } from "../state/gameMachine";
import type { OptionKey } from "../data/types";

export interface UseHotkeysCallbacks {
  onToggleCountdown: () => void;
  onSelectOption: (option: OptionKey) => void;
  onLockOrReveal: () => void;
  onNext: () => void;
  onFiftyRemove: () => void;
  onPhoneFriend: () => void;
  onAudiencePoll: () => void;
  onReplaceQuestion: () => void;
  onUndo: () => void;
  onMute: () => void;
  onFullscreen: () => void;
}

export interface UseHotkeysOptions extends UseHotkeysCallbacks {
  state: GameState;
  /** 暫時停用全部快捷鍵，例如彈出視窗開著的時候；預設 true（啟用）。 */
  enabled?: boolean;
}

export interface UseHotkeysResult {
  /** 「?」說明浮層是否開啟 */
  helpOpen: boolean;
  closeHelp: () => void;
}

export function useHotkeys(options: UseHotkeysOptions): UseHotkeysResult {
  const { state, enabled = true } = options;
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    function dispatchMatch(id: HotkeyId, option?: OptionKey): void {
      switch (id) {
        case "toggleCountdown":
          options.onToggleCountdown();
          break;
        case "selectOption":
          if (option) options.onSelectOption(option);
          break;
        case "lockOrReveal":
          options.onLockOrReveal();
          break;
        case "next":
          options.onNext();
          break;
        case "fiftyRemove":
          options.onFiftyRemove();
          break;
        case "phoneFriend":
          options.onPhoneFriend();
          break;
        case "audiencePoll":
          options.onAudiencePoll();
          break;
        case "replaceQuestion":
          options.onReplaceQuestion();
          break;
        case "undo":
          options.onUndo();
          break;
        case "mute":
          options.onMute();
          break;
        case "fullscreen":
          options.onFullscreen();
          break;
        case "help":
          setHelpOpen((v) => !v);
          break;
        default:
          break;
      }
    }

    function handleKeyDown(e: KeyboardEvent): void {
      const match = computeHotkeyAction(e, state);
      if (!match) return;
      e.preventDefault();
      dispatchMatch(match.id, match.option);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // options（含所有 callback）每次 render 都可能是新的物件/函式參考；直接放進依賴陣列，
    // 讓監聽器每次 render 都重新綁定，避免 callback 用到過期的閉包（例如上一輪的 state）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, enabled, options]);

  return { helpOpen, closeHelp: () => setHelpOpen(false) };
}

export { HOTKEY_TABLE } from "./hotkeys";
export type { HotkeyId } from "./hotkeys";
