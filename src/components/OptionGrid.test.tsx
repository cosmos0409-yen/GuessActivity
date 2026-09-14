// @vitest-environment jsdom
//
// 全場一起協助收票後，百分比要留在題目畫面的四個選項上（使用者 2026-09-14 要求：
// 原本收票後統計圖直接消失，畫面上完全看不到投票結果）。
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OptionGrid from "./OptionGrid";
import type { Question } from "../data/types";

const question = {
  id: "T01",
  correct: "B",
  options: { A: "甲", B: "乙", C: "丙", D: "丁" },
} as unknown as Question;

const baseProps = {
  question,
  locked: false,
  revealed: false,
  selectable: true,
  onSelect: () => {},
};

afterEach(cleanup);

describe("OptionGrid 的投票百分比", () => {
  it("有投票結果時，每個選項都顯示自己的百分比", () => {
    render(<OptionGrid {...baseProps} pollPercents={{ A: 10, B: 60, C: 25, D: 5 }} />);
    expect(screen.getByRole("button", { name: /選項 A/ }).textContent).toContain("10%");
    expect(screen.getByRole("button", { name: /選項 B/ }).textContent).toContain("60%");
    expect(screen.getByRole("button", { name: /選項 D/ }).textContent).toContain("5%");
  });

  it("沒有投票結果時不顯示百分比", () => {
    render(<OptionGrid {...baseProps} />);
    expect(screen.getByRole("group", { name: "選項" }).textContent).not.toContain("%");
  });

  it("被刪除的選項不顯示百分比", () => {
    render(<OptionGrid {...baseProps} removedOption="C" pollPercents={{ A: 10, B: 60, C: 25, D: 5 }} />);
    expect(screen.getByRole("button", { name: /選項 C/ }).textContent).not.toContain("%");
  });
});
