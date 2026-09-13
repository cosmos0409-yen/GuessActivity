// 輕量 CSV 解析器（RFC4180）：處理雙引號欄位、欄位內的逗號與換行、"" 跳脫、BOM、CRLF。
// 不依賴任何第三方套件。

/**
 * 將 CSV 文字解析成二維陣列（每一列都是字串陣列）。
 * - 自動去除開頭的 UTF-8 BOM。
 * - 支援 \r\n、\n、\r 三種換行方式。
 * - 支援雙引號欄位，欄位內可以包含逗號、換行；"" 代表跳脫成一個雙引號字元。
 * - 空白行會被跳過（不會產生只有一個空字串欄位的列），但欄位內的空白行不受影響。
 */
export function parseCsv(input: string): string[][] {
  // 去除 BOM
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;
  let rowHasContent = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    rowHasContent = false;
  };

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      rowHasContent = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      rowHasContent = true;
      pushField();
      i += 1;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      // 判斷是否是完全空白的一行（沒有任何欄位內容、也還沒開始累積字元）
      if (!rowHasContent && field === "" && row.length === 0) {
        // 純空白行：跳過，但仍要吃掉 \r\n 這一組換行
        if (ch === "\r" && text[i + 1] === "\n") {
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (ch === "\r" && text[i + 1] === "\n") {
        i += 2;
      } else {
        i += 1;
      }
      pushRow();
      continue;
    }

    rowHasContent = true;
    field += ch;
    i += 1;
  }

  // 最後一列（如果檔案沒有以換行結尾）
  if (rowHasContent || field !== "" || row.length > 0) {
    pushRow();
  }

  return rows;
}

/** 一筆依表頭對應好的 CSV 資料列，附上原始列號方便回報驗證錯誤。 */
export interface CsvRecord {
  /** 原始列號（從 1 起算；表頭視為第 1 列，第一筆資料是第 2 列） */
  row: number;
  /** 依表頭名稱對應的欄位值 */
  fields: Record<string, string>;
}

/**
 * 將 CSV 文字解析成「依表頭對應」的紀錄陣列。第一列視為表頭；
 * 之後每一列會對應成 { 表頭: 值 } 的物件，欄位數不足時補空字串，多出的欄位會被忽略。
 * 每筆紀錄都附上原始列號，方便呼叫端在驗證失敗時回報「第幾列」。
 */
export function parseCsvRecords(input: string): CsvRecord[] {
  const rows = parseCsv(input);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const records: CsvRecord[] = [];

  for (let r = 1; r < rows.length; r++) {
    const rawRow = rows[r];
    // 忽略整列都是空字串的資料列（例如結尾多一個空行）
    if (rawRow.every((cell) => cell.trim() === "")) continue;

    const fields: Record<string, string> = {};
    header.forEach((key, idx) => {
      fields[key] = rawRow[idx] !== undefined ? rawRow[idx] : "";
    });
    records.push({ row: r + 1, fields });
  }

  return records;
}
