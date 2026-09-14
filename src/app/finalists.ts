// 選拔賽（全場搶答 live-quiz）→ 決賽（本程式）的銜接：
// 選拔賽主持人在最終排名畫面按「前往決賽」，會開啟本程式並在網址帶上前 3 名的暱稱：
//   https://cosmos0409-yen.github.io/GuessActivity/?c=第1名&c=第2名&c=第3名
// 用重複的 c 參數（而不是用逗號分隔），暱稱裡有逗號也不會被切開。
// 兩套系統在不同網域，瀏覽器的 localStorage 不互通，所以只能用網址傳遞。

export const MAX_FINALISTS = 3;
export const MAX_NAME_LENGTH = 20; // 與大廳輸入框的 maxLength 一致

/** 從網址的查詢字串讀出決賽挑戰者名單（去除空白與重複、最多 3 位、每位最多 20 字） */
export function parseFinalists(search: string): string[] {
  const names: string[] = [];
  for (const raw of new URLSearchParams(search).getAll("c")) {
    const name = raw.trim().slice(0, MAX_NAME_LENGTH);
    if (name && !names.includes(name)) names.push(name);
    if (names.length === MAX_FINALISTS) break;
  }
  return names;
}
