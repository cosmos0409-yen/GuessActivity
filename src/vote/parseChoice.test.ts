import { describe, expect, it } from "vitest";
import { parseChoice } from "./parseChoice";

describe("parseChoice", () => {
  it("解析單一字母（大小寫皆可）", () => {
    expect(parseChoice("A")).toBe("A");
    expect(parseChoice("b")).toBe("B");
    expect(parseChoice(" C ")).toBe("C");
  });

  it("解析 \"A. 選項文字\" 這類格式", () => {
    expect(parseChoice("A. 選項文字")).toBe("A");
    expect(parseChoice("B、選項文字")).toBe("B");
    expect(parseChoice("C) 選項文字")).toBe("C");
    expect(parseChoice("D．選項文字")).toBe("D");
  });

  it("解析 \"選項 A\" 這類格式", () => {
    expect(parseChoice("選項 A")).toBe("A");
    expect(parseChoice("選項B")).toBe("B");
  });

  it("解析不出來時回傳 null", () => {
    expect(parseChoice("")).toBeNull();
    expect(parseChoice(undefined)).toBeNull();
    expect(parseChoice(null)).toBeNull();
    expect(parseChoice("不知道")).toBeNull();
    expect(parseChoice("E")).toBeNull();
  });
});
