// @vitest-environment jsdom
//
// 回歸測試（2026-09-13 第二輪試玩問題 3、4）：
//
// 問題 3：題目剛出現、主持人還沒按「開始」時，倒數位置顯示「⏸ 不計時」，
//   應該顯示完整秒數待命；「不計時」只在使用提示卡（永久停止倒數）之後才出現。
//   根本原因：src/App.tsx 把 CountdownRing 的 stopped 算成 `state.phase !== "counting"`，
//   questionShown（還沒按開始）也會被誤判成「不計時」。
//
// 問題 4：時間到沒有明顯的「⏰ 時間到！」提示，答錯的結算畫面也沒寫原因
//   （時間到 / 答錯了）。GameState.timedOut 已經有了，只差畫面呈現。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

const FIXTURE_DIR = resolve(__dirname, "../public");
const questionsCsv = readFileSync(resolve(FIXTURE_DIR, "sample-questions.csv"), "utf-8");
const categoriesCsv = readFileSync(resolve(FIXTURE_DIR, "sample-categories.csv"), "utf-8");

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const text = url.includes("categories") || url.includes("gid=471665721") ? categoriesCsv : questionsCsv;
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

async function bootAndPickCategory() {
  render(<App />);
  const bootButton = await screen.findByRole("button", { name: "開始" });
  fireEvent.click(bootButton);
  const nameInput = await screen.findByLabelText("參賽者名字");
  fireEvent.change(nameInput, { target: { value: "測試員" } });
  fireEvent.click(screen.getByRole("button", { name: "開始新的一場" }));

  const categoryButtons = await screen.findAllByRole("button", { name: /剩餘 \d+ 題/ });
  const pickable = categoryButtons.find((btn) => !btn.hasAttribute("disabled"));
  expect(pickable).toBeDefined();
  fireEvent.click(pickable!);

  await screen.findByRole("button", { name: "開始" });
}

describe("倒數待命畫面（問題 3）", () => {
  it("題目剛出現、還沒按開始時，要顯示完整秒數待命，不能顯示「不計時」", async () => {
    await bootAndPickCategory();

    expect(document.querySelector(".tpi-countdown__notimer")).toBeNull();
    const label = document.querySelector(".tpi-countdown-ring__label");
    expect(label?.textContent).toBe("30");
  });

  it("按下開始、倒數開始跑之後仍然不是「不計時」", async () => {
    await bootAndPickCategory();
    const startButton = screen.getByRole("button", { name: "開始" }) as HTMLButtonElement;

    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
    });
    act(() => {
      fireEvent.click(startButton);
      vi.advanceTimersByTime(3000);
    });

    expect(document.querySelector(".tpi-countdown__notimer")).toBeNull();
    const label = document.querySelector(".tpi-countdown-ring__label");
    expect(Number(label?.textContent)).toBeLessThan(30);
  });
});

describe("時間到提示與結算原因（問題 4）", () => {
  it("倒數歸零要先顯示「⏰ 時間到！」，1.5 秒後才消失；結算畫面要寫「時間到」", async () => {
    await bootAndPickCategory();
    const startButton = screen.getByRole("button", { name: "開始" }) as HTMLButtonElement;

    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
    });

    act(() => {
      fireEvent.click(startButton);
    });

    // 推進超過 30 秒，觸發 TIMEOUT。
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByRole("alert").textContent).toContain("時間到");

    // 還沒滿 1.5 秒，提示應該還在。
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("⏰ 時間到！")).not.toBeNull();

    // 滿 1.5 秒後提示消失。
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByText("⏰ 時間到！")).toBeNull();

    // 走到結算畫面（答錯，第一關，沒有任何已過關卡）：先顯示詳解，再下一步進 gameOver。
    const nextButton = screen.getByRole("button", { name: "下一步" }) as HTMLButtonElement;
    act(() => {
      fireEvent.click(nextButton);
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    });

    const resultDialog = screen.getByRole("alertdialog", { name: "答錯" });
    expect(resultDialog.textContent).toContain("時間到");
  });
});
