// 時間校準（規格第 5 節第 2 條）：記錄 serverNow 與本地時間的差值，
// 之後用 startedAt + timeLimit 推算剩餘時間，全場的倒數才會同步（手機時鐘不準也沒關係）。
let offsetMs = 0;

export function syncClock(serverNow) {
  if (typeof serverNow === "number") offsetMs = serverNow - Date.now();
}

export function serverTime() {
  return Date.now() + offsetMs;
}

export function remainingMs(startedAt, timeLimitSec) {
  return Math.max(0, startedAt + timeLimitSec * 1000 - serverTime());
}
