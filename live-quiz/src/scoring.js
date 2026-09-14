// 計分公式（規格第 6 節）：答錯 0 分；答對 = round(1000 × (1 − (作答時間 ÷ 時限) × 0.5))
// responseMs 由伺服器計算（收到答案的時間 − 題目 startedAt），不相信客戶端回報的時間。
// 超過時限的寬限期內送達的答案，以時限計（最低 500 分），不會出現負分。
export function scoreFor(responseMs, timeLimitSec) {
  const limitMs = timeLimitSec * 1000;
  const clamped = Math.min(Math.max(responseMs, 0), limitMs);
  return Math.round(1000 * (1 - (clamped / limitMs) * 0.5));
}
