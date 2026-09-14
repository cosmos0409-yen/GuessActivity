import { describe, expect, it } from "vitest";
import { parseFinalists } from "./finalists";

describe("parseFinalists（選拔賽前 3 名帶進決賽）", () => {
  it("依網址順序讀出名字（第 1 名在最前面）", () => {
    expect(parseFinalists("?c=%E9%98%BF%E6%98%8E&c=%E5%B0%8F%E8%8F%AF&c=%E5%A4%A7%E9%9B%84")).toEqual(["阿明", "小華", "大雄"]);
  });

  it("暱稱裡有逗號也不會被切開", () => {
    expect(parseFinalists("?c=" + encodeURIComponent("王,小明"))).toEqual(["王,小明"]);
  });

  it("去掉空白與重複，最多 3 位、每位最多 20 字", () => {
    const long = "字".repeat(25);
    expect(parseFinalists(`?c=%20&c=a&c=a&c=b&c=c&c=d&c=${long}`)).toEqual(["a", "b", "c"]);
    expect(parseFinalists(`?c=${long}`)[0]).toHaveLength(20);
  });

  it("沒有帶名單時回傳空陣列（大廳就不顯示名單）", () => {
    expect(parseFinalists("")).toEqual([]);
    expect(parseFinalists("?other=1")).toEqual([]);
  });
});
