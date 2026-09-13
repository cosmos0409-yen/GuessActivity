// 遊戲規則設定（每題秒數／時間到的處理／彩排模式）：存在 localStorage，
// 設定頁可以調整。讀寫一律用 try/catch 包起來，內容毀損或欄位型別不對時，
// 該欄位個別退回預設值，不會讓整個讀取失敗。
//
// 沒有保底關概念：答錯一律帶走「答錯之前已經通過的關數」的獎勵，只是不能再繼續挑戰。

export type TimeoutPolicy = "wrong" | "host";

export interface RuleSettings {
  /** 每題倒數秒數，預設 30 */
  seconds: number;
  /** 時間到的處理：'wrong' 算答錯；'host' 交由主持人裁量 */
  timeoutPolicy: TimeoutPolicy;
  /** 彩排模式：不寫入已使用題目、不寫入排行榜 */
  rehearsal: boolean;
}

const STORAGE_KEY = "quiz.settings.rules.v1";

export const DEFAULT_RULE_SETTINGS: RuleSettings = {
  seconds: 30,
  timeoutPolicy: "wrong",
  rehearsal: false,
};

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
    /* 忽略：私密瀏覽模式或容量已滿 */
  }
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

/** 讀取設定；localStorage 沒有資料、不可用、內容毀損，或個別欄位型別不對，都退回預設值。 */
export function loadRuleSettings(): RuleSettings {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_RULE_SETTINGS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_RULE_SETTINGS };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ...DEFAULT_RULE_SETTINGS };
  }

  const obj = parsed as Record<string, unknown>;
  const seconds = isPositiveInt(obj.seconds) ? obj.seconds : DEFAULT_RULE_SETTINGS.seconds;
  const timeoutPolicy: TimeoutPolicy = obj.timeoutPolicy === "host" ? "host" : "wrong";
  const rehearsal = typeof obj.rehearsal === "boolean" ? obj.rehearsal : DEFAULT_RULE_SETTINGS.rehearsal;

  return { seconds, timeoutPolicy, rehearsal };
}

/** 儲存設定；localStorage 不可用時靜默失敗，不應該讓現場操作中斷。 */
export function saveRuleSettings(settings: RuleSettings): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(settings));
}
