// @vitest-environment jsdom
//
// 回歸測試（問題 1）：按「開始」後倒數要真的開始跑。
//
// 根本原因：App.tsx 的 handleStart() 只 dispatch({type:"START"})，
// 從來沒有呼叫 mainCountdown.start()（useCountdown 回傳的 start），
// 導致 CountdownClock 的 setInterval 從來沒有被啟動，remainingMs 永遠停在初始值，
// 也永遠不會觸發 onExpire → dispatch({type:"TIMEOUT"})。
//
// 這裡直接渲染整個 <App />（而不是重造一份簡化的倒數 wiring），才能真正保護到
// App.tsx 那一行修正，不會因為之後重構又漏接。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

const FIXTURE_DIR = resolve(__dirname, "../public");
const questionsCsv = readFileSync(resolve(FIXTURE_DIR, "sample-questions.csv"), "utf-8");
const categoriesCsv = readFileSync(resolve(FIXTURE_DIR, "sample-categories.csv"), "utf-8");

function readCountdownLabel(): string | null {
  return document.querySelector(".tpi-countdown-ring__label")?.textContent ?? null;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const text = url.includes("categories") ? categoriesCsv : questionsCsv;
      return {
        ok: true,
        status: 200,
        text: async () => text,
      } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("App 倒數計時整合測試", () => {
  it("按下「開始」後，倒數會隨時間真的遞減；到 0 會觸發 TIMEOUT（下一步從停用變成可用）", async () => {
    render(<App />);

    // 開場鎖定畫面
    const bootButton = await screen.findByRole("button", { name: "開始" });
    fireEvent.click(bootButton);

    // 大廳：輸入參賽者名字、開始新的一場
    const nameInput = await screen.findByLabelText("參賽者名字");
    fireEvent.change(nameInput, { target: { value: "測試員" } });
    fireEvent.click(screen.getByRole("button", { name: "開始新的一場" }));

    // 選題型：挑第一個還沒被停用的題型卡片
    const categoryButtons = await screen.findAllByRole("button", { name: /剩餘 \d+ 題/ });
    const pickable = categoryButtons.find((btn) => !btn.hasAttribute("disabled"));
    expect(pickable).toBeDefined();
    fireEvent.click(pickable!);

    // 進入 questionShown：主持人操作列的「開始」按鈕應該是可以按的
    const startButton = (await screen.findByRole("button", { name: "開始" })) as HTMLButtonElement;
    expect(startButton.disabled).toBe(false);

    // 倒數還沒開始前，「下一步」是停用的（還沒揭曉答案）
    expect((screen.getByRole("button", { name: "下一步" }) as HTMLButtonElement).disabled).toBe(true);

    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
    });

    act(() => {
      fireEvent.click(startButton);
    });

    const before = readCountdownLabel();
    expect(before).toBe("30"); // 每題預設 30 秒

    // 推進 3 秒：如果 mainCountdown.start() 沒有被呼叫，這裡的數字完全不會變。
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const after3s = readCountdownLabel();
    expect(after3s).not.toBeNull();
    expect(Number(after3s)).toBeLessThan(Number(before));

    // 再推進到超過 30 秒總長，讓倒數真的跑到 0 觸發 TIMEOUT。
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // timeoutPolicy 預設 'wrong'：TIMEOUT 後 phase 變成 revealed，
    // 主持人操作列的「下一步」（can(SHOW_EXPLANATION)）從停用變成可以按。
    expect((screen.getByRole("button", { name: "下一步" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
