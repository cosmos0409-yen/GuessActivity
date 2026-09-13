// 組合以 Vite 的 BASE_URL 為前綴的靜態資源路徑。
//
// 部署到 GitHub Pages 時網站不在網域根目錄（例如 /GuessActivity/），
// 所有寫死在原始碼裡、指向 public/ 資源的路徑都要加上這個前綴，
// 否則正式站會抓不到圖片、音效、CSV 等檔案。
//
// import.meta.env.BASE_URL 在 Vite 環境下一定有值且結尾帶 "/"（預設 "/"）；
// 在 vitest 的 node 環境下也是同一套 Vite 定義，所以測試不需要額外 mock。
// 這裡仍保留 fallback，避免任何邊界情況下 BASE_URL 是 undefined 時整段路徑壞掉。

export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}
