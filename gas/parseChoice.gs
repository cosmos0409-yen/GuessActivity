// 解析觀眾投票答案文字，取出 A/B/C/D。
//
// ⚠️ 同步修改注意：這份邏輯與 `src/vote/parseChoice.ts` 必須保持完全一致。
// Apps Script 專案無法 import 前端的 TypeScript 檔案，所以邏輯用純函式各放一份；
// 修改任何一份的比對規則時，記得同時更新另一份。

/**
 * 把使用者填寫的答案字串解析成 "A"/"B"/"C"/"D"。
 * 容錯格式範例：
 *   "A"、"a"
 *   "A. 選項文字"、"A、選項文字"、"A) 選項文字"、"A．選項文字"
 *   "選項 A"、"選項A"
 * 解析不出來回傳 null。
 *
 * @param {string} raw
 * @return {string|null}
 */
function parseChoice(raw) {
  if (raw === null || raw === undefined) return null;
  var s = String(raw).trim();
  if (!s) return null;
  var upper = s.toUpperCase();

  // 1. 整欄就是單一字母
  if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
    return upper;
  }

  // 2. 開頭是 "A" 後面接分隔符號："A. xxx"、"A、xxx"、"A) xxx"、"A．xxx"、"A xxx"
  var prefixMatch = upper.match(/^([A-D])[\s.,、)．)]/);
  if (prefixMatch) {
    return prefixMatch[1];
  }

  // 3. "選項 A" / "選項A" 這類格式
  var suffixMatch = upper.match(/選項\s*([A-D])\b/);
  if (suffixMatch) {
    return suffixMatch[1];
  }

  return null;
}
