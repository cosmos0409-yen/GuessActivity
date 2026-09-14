// @vitest-environment jsdom
//
// 全場一起協助（2026-09-14 使用者要求）：
//   1. 按下提示卡後以「彈窗」顯示，彈窗裡有題目本文，觀眾投票時看得到題目。
//   2. 可以「收起」成角落小視窗（票照收），再「展開」回來。
//   3. 收票後，百分比要留在四個選項上（原本統計圖直接消失，畫面上看不到結果）。
// 為了不依賴網路，這裡關閉線上投票，走主持人手動輸入。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

const FIXTURE_DIR = resolve(__dirname, "../public");
const questionsCsv = readFileSync(resolve(FIXTURE_DIR, "sample-questions.csv"), "utf-8");
const categoriesCsv = readFileSync(resolve(FIXTURE_DIR, "sample-categories.csv"), "utf-8");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "quiz.vote.settings.v1",
    JSON.stringify({ formUrl: "https://example.com/f?{round}", statsUrl: "https://example.com/s", intervalMs: 2000, enabled: false }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const text = url.includes("categories") || url.includes("gid=471665721") ? categoriesCsv : questionsCsv;
      return { ok: true, status: 200, text: async () => text } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function bootToQuestion() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "開始" }));
  fireEvent.change(await screen.findByLabelText("參賽者名字"), { target: { value: "測試員" } });
  fireEvent.click(screen.getByRole("button", { name: "開始新的一場" }));
  const picker = await screen.findByLabelText("選擇題型");
  const category = within(picker)
    .getAllByRole("button")
    .find((b) => !(b as HTMLButtonElement).disabled)!;
  fireEvent.click(category);
  fireEvent.click(await screen.findByRole("button", { name: "開始" }));
}

describe("全場一起協助：彈窗、收起、百分比留在選項上", () => {
  it("彈窗顯示題目；收起後變成小視窗；收票後百分比出現在選項上", async () => {
    await bootToQuestion();
    const questionText = document.querySelector(".tpi-question-card")!.textContent!;

    fireEvent.click(screen.getByRole("button", { name: /全場一起協助/ }));
    const dialog = await screen.findByRole("dialog", { name: "全場一起協助投票" });
    const shownQuestion = dialog.querySelector(".tpi-poll-modal__question")!.textContent!;
    expect(shownQuestion.length).toBeGreaterThan(0);
    expect(questionText).toContain(shownQuestion);

    // 收起 → 小視窗；展開 → 回到彈窗
    fireEvent.click(within(dialog).getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("dialog", { name: "全場一起協助投票" })).toBeNull();
    const chip = screen.getByLabelText("投票進行中");
    fireEvent.click(within(chip).getByRole("button", { name: "展開" }));
    const reopened = screen.getByRole("dialog", { name: "全場一起協助投票" });

    // 手動輸入 A 60、B 40 → 提早收票
    fireEvent.change(within(reopened).getByLabelText("選項 A 手動百分比"), { target: { value: "60" } });
    fireEvent.change(within(reopened).getByLabelText("選項 B 手動百分比"), { target: { value: "40" } });
    fireEvent.click(within(reopened).getByRole("button", { name: "提早收票" }));

    expect(screen.queryByRole("dialog", { name: "全場一起協助投票" })).toBeNull();
    expect(screen.queryByLabelText("投票進行中")).toBeNull();
    expect(screen.getByRole("button", { name: /^選項 A/ }).textContent).toContain("60%");
    expect(screen.getByRole("button", { name: /^選項 B/ }).textContent).toContain("40%");
    expect(screen.getByRole("button", { name: /^選項 C/ }).textContent).toContain("0%");
  });
});
