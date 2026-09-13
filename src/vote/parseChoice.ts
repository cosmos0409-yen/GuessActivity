// 解析觀眾投票答案文字，取出 A/B/C/D。
//
// ⚠️ 同步修改注意：這份邏輯與 `gas/parseChoice.gs` 必須保持完全一致。
// Google Apps Script 無法直接 import 這個檔案，所以邏輯用純函式各放一份；
// 修改任何一份的比對規則時，記得同時更新另一份，並同步更新兩邊的測試。

export type Choice = "A" | "B" | "C" | "D";

const CHOICES: readonly Choice[] = ["A", "B", "C", "D"];

/**
 * 把使用者填寫的答案字串解析成 A/B/C/D。
 * 容錯格式範例：
 *   "A"、"a"
 *   "A. 選項文字"、"A、選項文字"、"A) 選項文字"、"A．選項文字"
 *   "選項 A"、"選項A"
 * 解析不出來回傳 null（呼叫端應忽略該列，不計入統計）。
 */
export function parseChoice(raw: string | null | undefined): Choice | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const upper = s.toUpperCase();

  // 1. 整欄就是單一字母
  if ((CHOICES as readonly string[]).includes(upper)) {
    return upper as Choice;
  }

  // 2. 開頭是 "A" 後面接分隔符號："A. xxx"、"A、xxx"、"A) xxx"、"A．xxx"、"A xxx"
  const prefixMatch = upper.match(/^([A-D])[\s.,、)．)]/);
  if (prefixMatch) {
    return prefixMatch[1] as Choice;
  }

  // 3. "選項 A" / "選項A" 這類格式
  const suffixMatch = upper.match(/選項\s*([A-D])\b/);
  if (suffixMatch) {
    return suffixMatch[1] as Choice;
  }

  return null;
}
