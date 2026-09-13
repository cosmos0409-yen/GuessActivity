// 已使用題目 id 的本機儲存（localStorage），可以一鍵重置。

const USED_IDS_KEY = "quiz.used.ids";

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
    // 忽略
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // 忽略
  }
}

export function getUsedIds(): Set<string> {
  const raw = safeGetItem(USED_IDS_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

export function markUsed(id: string): void {
  const ids = getUsedIds();
  ids.add(id);
  safeSetItem(USED_IDS_KEY, JSON.stringify(Array.from(ids)));
}

export function resetUsed(): void {
  safeRemoveItem(USED_IDS_KEY);
}
