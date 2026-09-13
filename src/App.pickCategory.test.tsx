// @vitest-environment jsdom
//
// 回歸測試（2026-09-13 第二輪試玩問題 1）：「憲法法庭與實務」點了沒反應。
//
// 根本原因：src/App.tsx 算「剩餘題數」（availabilityMap）時，只用了 state.usedQuestionIds
// （這一場遊戲才用過的題目），完全沒把 src/data/usedStore.ts 裡「跨場次已使用題目」
// （localStorage `quiz.used.ids`）算進去。所以主控台會顯示「剩餘 1 題」等錯誤數字，
// 但實際呼叫 drawQuestionForRound() 抽題時，它會排除掉 usedStore 裡的已用題目，
// 回傳 null；handlePickCategory 原本在 question 是 null 時什麼都不做，
// 主持人畫面上只看得到按鈕的 focus 外框，沒有任何錯誤訊息。
//
// 這裡驗證兩件事：
//   1. 已經在別場用掉的題目，剩餘題數要正確顯示為 0、按鈕要停用（不能再點進去）。
//   2. 就算真的抽到 null（例如未來又出現算錯的邊界案例），也要在畫面上顯示訊息，
//      不能像以前一樣完全沒反應（fail loud，不能靜默失敗）。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  vi.unstubAllGlobals();
  vi.doUnmock("./app/gameFlow");
  vi.resetModules();
  localStorage.clear();
});

async function bootToCategoryPicker() {
  render(<App />);
  const bootButton = await screen.findByRole("button", { name: "開始" });
  fireEvent.click(bootButton);
  const nameInput = await screen.findByLabelText("參賽者名字");
  fireEvent.change(nameInput, { target: { value: "測試員" } });
  fireEvent.click(screen.getByRole("button", { name: "開始新的一場" }));
  await screen.findByLabelText("選擇題型");
}

describe("選題型：跨場次已用題目要正確算進剩餘題數", () => {
  it("這一場還沒選過、但題目已經在別場用掉的題型，剩餘題數要顯示 0 且按鈕停用", async () => {
    // L06 是「憲法法庭與實務」難度 1 唯一的題目（見 public/sample-questions.csv），
    // 直接模擬「上一場已經用過」：寫進 usedStore 用的 localStorage key。
    localStorage.setItem("quiz.used.ids", JSON.stringify(["L06"]));

    await bootToCategoryPicker();

    const button = (await screen.findByRole("button", {
      name: /憲法法庭與實務，難度 1，剩餘 \d+ 題/,
    })) as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toMatch(/剩餘 0 題/);
    expect(button.disabled).toBe(true);
  });

  it("這一場也沒選過、題目也還沒用掉的題型，剩餘題數維持 1、按鈕可以點", async () => {
    localStorage.setItem("quiz.used.ids", JSON.stringify(["L06"]));

    await bootToCategoryPicker();

    const otherButton = (await screen.findByRole("button", {
      name: /比較法大觀園，難度 1，剩餘 \d+ 題/,
    })) as HTMLButtonElement;
    expect(otherButton.getAttribute("aria-label")).toMatch(/剩餘 1 題/);
    expect(otherButton.disabled).toBe(false);
  });
});

describe("選題型：抽題回傳 null 時要在畫面上顯示訊息，不能靜默失敗", () => {
  it("drawQuestionForRound 回傳 null 時，畫面要出現錯誤訊息而不是完全沒反應", async () => {
    vi.doMock("./app/gameFlow", async () => {
      const actual = await vi.importActual<typeof import("./app/gameFlow")>("./app/gameFlow");
      return {
        ...actual,
        drawQuestionForRound: vi.fn(() => null),
      };
    });

    const { default: AppWithMockedDraw } = await import("./App");
    render(<AppWithMockedDraw />);

    const bootButton = await screen.findByRole("button", { name: "開始" });
    fireEvent.click(bootButton);
    const nameInput = await screen.findByLabelText("參賽者名字");
    fireEvent.change(nameInput, { target: { value: "測試員" } });
    fireEvent.click(screen.getByRole("button", { name: "開始新的一場" }));
    await screen.findByLabelText("選擇題型");

    const categoryButtons = await screen.findAllByRole("button", { name: /剩餘 \d+ 題/ });
    const pickable = categoryButtons.find((btn) => !btn.hasAttribute("disabled"));
    expect(pickable).toBeDefined();

    fireEvent.click(pickable!);

    // 就算抽題回傳 null，畫面上還是要留在選題畫面（不會白白跳走），
    // 而且要顯示明確的錯誤訊息，不能只有 focus 外框、什麼提示都沒有。
    expect(await screen.findByLabelText("選擇題型")).not.toBeNull();
    expect(await screen.findByText(/目前沒有可以抽的題目了/)).not.toBeNull();
  });
});
