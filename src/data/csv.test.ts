import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, parseCsvRecords } from "./csv";

function readFixture(name: string): string {
  const url = new URL(`./__fixtures__/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("parseCsv", () => {
  it("解析基本的逗號分隔列", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("處理雙引號欄位內的逗號、換行與 \"\" 跳脫", () => {
    const csv = readFixture("questions-quoted.csv");
    const rows = parseCsv(csv);
    // 第一列是表頭
    expect(rows[0][0]).toBe("id"); // BOM 應該已被移除
    const dataRow = rows[1];
    expect(dataRow[4]).toContain("逗號");
    expect(dataRow[4]).toContain('"引號"'); // "" 跳脫成一個雙引號字元
    // 詳解欄位（index 12）包含真正的換行字元
    expect(dataRow[12]).toContain("\n");
    expect(dataRow[12].split("\n")).toHaveLength(3);
  });

  it("去除開頭的 UTF-8 BOM", () => {
    const csv = readFixture("questions-quoted.csv");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = parseCsv(csv);
    expect(rows[0][0].charCodeAt(0)).not.toBe(0xfeff);
  });

  it("支援 CRLF 換行", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("表頭順序不同也能依名稱對應", () => {
    const csv = readFixture("questions-quoted.csv");
    const records = parseCsvRecords(csv);
    expect(records).toHaveLength(1);
    // questions-quoted.csv 的表頭順序是 id,領域,難度,題型,... 圖片網址放最後
    expect(records[0].fields["題型"]).toBe("法界圈內梗");
    expect(records[0].fields["領域"]).toBe("法律");
    expect(records[0].fields["難度"]).toBe("3");
  });

  it("附上原始列號（含表頭起算）", () => {
    const csv = "a,b\n1,2\n3,4\n";
    const records = parseCsvRecords(csv);
    expect(records[0].row).toBe(2);
    expect(records[1].row).toBe(3);
  });
});
