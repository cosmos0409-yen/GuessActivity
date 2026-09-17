import { useLayoutEffect, type RefObject } from "react";

/**
 * 投影畫面放不下時整體縮小字級：在 container 上設定 CSS 變數 --tpi-fit（1 → min），
 * CSS 裡的字級寫成 max(下限, calc(var(--tpi-fit, 1) * 原本字級))。
 * 「放得下」＝ container 自己與 boxes（有 overflow 的格子）都沒有被裁切或需要捲動。
 * 以 1366×768 為基準（2026-09-17 使用者要求：每個階段的每一題都要完整顯示）。
 */
export function fitToBox(container: HTMLElement, boxes: HTMLElement[] = [], min = 0.5, step = 0.04): number {
  const targets = [container, ...boxes];
  let fit = 1;
  for (;;) {
    container.style.setProperty("--tpi-fit", fit.toFixed(2));
    const overflow = targets.some((el) => el.scrollHeight > el.clientHeight + 1);
    if (!overflow || fit <= min) return fit;
    fit = Math.max(min, fit - step);
  }
}

/**
 * 內容（deps）改變或視窗大小改變時重新計算 --tpi-fit。
 * boxSelectors：container 裡面另外要檢查的格子（例如題目卡內層，它自己有 overflow: auto）。
 */
export function useFitText(ref: RefObject<HTMLElement | null>, boxSelectors: string[], deps: unknown[]): void {
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const run = () => {
      const boxes = boxSelectors.flatMap((sel) => Array.from(container.querySelectorAll<HTMLElement>(sel)));
      fitToBox(container, boxes);
    };
    run();
    window.addEventListener("resize", run);
    // 裡面的圖片（例如投票 QR code）載入完才會撐高，載入後要重算；load 事件不冒泡，用 capture 接
    container.addEventListener("load", run, true);
    return () => {
      window.removeEventListener("resize", run);
      container.removeEventListener("load", run, true);
    };
    // deps 由呼叫端決定（題目、揭曉、刪除選項、投票結果…）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
