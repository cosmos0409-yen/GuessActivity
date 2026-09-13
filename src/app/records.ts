// 場次紀錄（GameRecord）的本機儲存、排行榜排序、CSV 匯出。
//
// 紀錄本身在彩排模式下不會產生（gameMachine.ts 的 reducer 已經處理），
// 這裡只負責「把 reducer 吐出來的 GameRecord 存起來」與「排序／匯出」，
// 完全是純函式，方便測試；只有 downloadRecordsCsv() 會碰 DOM（觸發下載），
// 那個函式本身不含任何業務邏輯，不特別寫測試。

import type { GameRecord, LifelineKey } from "../state/gameMachine";

const STORAGE_KEY = "quiz.records.v1";

function safeGetItem(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* 忽略 */
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

function isGameRecordLike(x: unknown): x is GameRecord {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  return (
    typeof obj.contestantName === "string" &&
    typeof obj.result === "string" &&
    Array.isArray(obj.levels) &&
    Array.isArray(obj.lifelinesUsed) &&
    typeof obj.clearedLevels === "number" &&
    typeof obj.timestamp === "string"
  );
}

/** 讀取全部場次紀錄；localStorage 沒有資料、不可用或內容毀損時回傳空陣列。 */
export function loadRecords(): GameRecord[] {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGameRecordLike);
  } catch {
    return [];
  }
}

function persist(records: GameRecord[]): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(records));
}

/** 把一場的紀錄加進本機儲存，回傳更新後的完整清單。 */
export function appendRecord(record: GameRecord): GameRecord[] {
  const records = [...loadRecords(), record];
  persist(records);
  return records;
}

/** 清除全部場次紀錄（呼叫端要先跳出確認）。 */
export function clearRecords(): void {
  safeRemoveItem(STORAGE_KEY);
}

/**
 * 排行榜排序：通過關數多的排前面；同分時使用提示卡數較少的排前面；
 * 再同分則較新的場次排前面。
 */
export function sortLeaderboard(records: GameRecord[]): GameRecord[] {
  return [...records].sort((a, b) => {
    if (b.clearedLevels !== a.clearedLevels) return b.clearedLevels - a.clearedLevels;
    if (a.lifelinesUsed.length !== b.lifelinesUsed.length) return a.lifelinesUsed.length - b.lifelinesUsed.length;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

const RESULT_LABEL: Record<GameRecord["result"], string> = {
  champion: "全破",
  gameOver: "答錯出局",
  walkedAway: "帶走獎勵",
};

const LIFELINE_LABEL: Record<LifelineKey, string> = {
  fiftyRemove: "刪除一個選項",
  phoneFriend: "指定人幫幫忙",
  audiencePoll: "全場一起協助",
};

const CSV_HEADERS = ["參賽者", "時間", "結果", "通過關數", "使用的提示卡", "各關題號與作答"];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatLevels(record: GameRecord): string {
  return record.levels
    .map((lv) => `第${lv.level}關:${lv.questionId}(${lv.selected ?? "未選"},${lv.correct ? "對" : "錯"})`)
    .join("; ");
}

/** UTF-8 BOM，加在 CSV 開頭方便 Excel 開啟時正確辨識編碼、不會變亂碼。 */
const UTF8_BOM = String.fromCharCode(0xfeff);

/** 產生排行榜 CSV 字串，開頭附 UTF-8 BOM。 */
export function buildRecordsCsv(records: GameRecord[]): string {
  const rows = [CSV_HEADERS.join(",")];
  for (const record of records) {
    const cells = [
      record.contestantName,
      record.timestamp,
      RESULT_LABEL[record.result] ?? record.result,
      String(record.clearedLevels),
      record.lifelinesUsed.map((key) => LIFELINE_LABEL[key] ?? key).join("、"),
      formatLevels(record),
    ].map(csvEscape);
    rows.push(cells.join(","));
  }
  return UTF8_BOM + rows.join("\r\n");
}

/** 在瀏覽器中觸發 CSV 檔案下載（用 Blob + <a download>；這個 App 一律在一般瀏覽器裡執行）。 */
export function downloadRecordsCsv(records: GameRecord[], filename = "闖關紀錄.csv"): void {
  const csv = buildRecordsCsv(records);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
