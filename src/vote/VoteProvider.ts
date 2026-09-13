// 「全場一起協助」投票資料層。
//
// 收票交給 Google 表單承擔；大螢幕只負責每隔一段時間向 Apps Script 查詢統計結果。
// 現場網路不可靠，所以任何連續失敗都要能讓 UI 提示主持人切到手動輸入
// （ManualVoteProvider），單次失敗不應該讓畫面閃爍。

export type OptionKey = "A" | "B" | "C" | "D";

export type VoteCounts = Record<OptionKey, number>;

export type VoteStatus = "idle" | "live" | "error" | "manual";

export interface VoteSnapshot {
  counts: VoteCounts;
  total: number;
  /** 四個選項的百分比，四捨五入後加總一定是 100（全部為 0 時例外，四個都是 0） */
  percents: VoteCounts;
  status: VoteStatus;
  error?: string;
  updatedAt: number;
}

/** 投票資料來源的共同介面：線上表單／手動輸入都實作這個介面 */
export interface VoteProvider {
  /** 開始針對某一題收票／統計 */
  start(roundId: string): void;
  /** 停止收票；之後不應該再有任何非同步的回呼發生（計時器要清乾淨） */
  stop(): void;
  /** 訂閱狀態變化；回傳的函式用來取消訂閱。訂閱時會立刻收到目前的 snapshot */
  subscribe(cb: (snapshot: VoteSnapshot) => void): () => void;
}

const OPTION_KEYS: readonly OptionKey[] = ["A", "B", "C", "D"];

export function emptyCounts(): VoteCounts {
  return { A: 0, B: 0, C: 0, D: 0 };
}

function idleSnapshot(): VoteSnapshot {
  return {
    counts: emptyCounts(),
    total: 0,
    percents: emptyCounts(),
    status: "idle",
    updatedAt: Date.now(),
  };
}

/** 把任意數值（可能是票數也可能是百分比）正規化成非負整數 counts */
function normalizeCounts(input: Partial<Record<OptionKey, number>>): VoteCounts {
  const out = emptyCounts();
  for (const key of OPTION_KEYS) {
    const raw = input[key];
    const n = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
    out[key] = n;
  }
  return out;
}

/**
 * 依票數比例算出百分比，四捨五入後仍保證加總為 100（最大餘數法）。
 * 全部為 0 時，四個百分比都回傳 0（而不是平均分配 25/25/25/25）。
 */
export function computePercents(counts: VoteCounts): VoteCounts {
  const total = OPTION_KEYS.reduce((sum, k) => sum + counts[k], 0);
  const out = emptyCounts();
  if (total <= 0) return out;

  const raw = OPTION_KEYS.map((k) => (counts[k] / total) * 100);
  const floors = raw.map(Math.floor);
  const flooredSum = floors.reduce((a, b) => a + b, 0);
  let remainder = Math.round(100 - flooredSum);

  const order = raw
    .map((value, i) => ({ i, frac: value - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let i = 0; i < remainder && i < order.length; i++) {
    result[order[i].i] += 1;
  }

  OPTION_KEYS.forEach((k, i) => {
    out[k] = result[i];
  });
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 驗證 Apps Script 回應的 JSON 結構是否符合 {round, counts:{A,B,C,D}, total, updatedAt} */
function isValidStatsResponse(
  data: unknown,
): data is { counts: Partial<Record<OptionKey, number>> } {
  if (!isPlainObject(data)) return false;
  const counts = data.counts;
  if (!isPlainObject(counts)) return false;
  return OPTION_KEYS.every((k) => {
    const v = counts[k];
    return v === undefined || typeof v === "number";
  });
}

// ---------------------------------------------------------------------------

export interface GoogleFormVoteProviderConfig {
  /** Google 表單「取得預先填入的連結」網址樣板，題號位置用 {round} 佔位 */
  formUrl: string;
  /** Apps Script Web App 網址（doGet 統計端點） */
  statsUrl: string;
  /** 輪詢間隔（毫秒），預設 2000 */
  intervalMs?: number;
  /** 單次請求逾時（毫秒），預設 5000 */
  timeoutMs?: number;
  /** 可注入測試用的 fetch 實作；預設用全域 fetch */
  fetchImpl?: typeof fetch;
}

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5000;
const FAILURE_THRESHOLD = 3;

export class GoogleFormVoteProvider implements VoteProvider {
  private readonly formUrl: string;
  private readonly statsUrl: string;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl?: typeof fetch;

  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(snapshot: VoteSnapshot) => void>();
  private roundId: string | null = null;
  private consecutiveFailures = 0;
  private inFlight = false;
  private snapshot: VoteSnapshot = idleSnapshot();

  constructor(config: GoogleFormVoteProviderConfig) {
    this.formUrl = config.formUrl;
    this.statsUrl = config.statsUrl;
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl;
  }

  /** 產生給 QR code / 連結按鈕使用的表單網址，{round} 會做 URL 編碼 */
  voteUrl(roundId: string): string {
    return this.formUrl.split("{round}").join(encodeURIComponent(roundId));
  }

  start(roundId: string): void {
    this.stop();
    this.roundId = roundId;
    this.consecutiveFailures = 0;
    this.emit({ ...idleSnapshot(), status: "live" });
    void this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.roundId = null;
  }

  subscribe(cb: (snapshot: VoteSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.snapshot);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(snapshot: VoteSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private async poll(): Promise<void> {
    const roundId = this.roundId;
    if (roundId === null || this.inFlight) return;
    this.inFlight = true;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const separator = this.statsUrl.includes("?") ? "&" : "?";
      const url = `${this.statsUrl}${separator}round=${encodeURIComponent(roundId)}`;
      const doFetch = this.fetchImpl ?? globalThis.fetch;
      const res = await doFetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new Error("回應不是合法的 JSON");
      }
      if (!isValidStatsResponse(data)) {
        throw new Error("回應格式不正確");
      }

      // start()/stop() 可能在等待回應期間被呼叫；忽略過期回應
      if (this.roundId !== roundId) return;

      this.consecutiveFailures = 0;
      const counts = normalizeCounts(data.counts);
      const total = OPTION_KEYS.reduce((sum, k) => sum + counts[k], 0);
      this.emit({
        counts,
        total,
        percents: computePercents(counts),
        status: "live",
        updatedAt: Date.now(),
      });
    } catch (err) {
      if (this.roundId !== roundId) return;
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
        this.emit({
          ...this.snapshot,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          updatedAt: Date.now(),
        });
      }
      // 未達門檻：保留目前畫面，不讓單次失敗造成閃爍
    } finally {
      clearTimeout(timeoutHandle);
      this.inFlight = false;
    }
  }
}

// ---------------------------------------------------------------------------

/** 手動輸入備援：主持人直接輸入票數或百分比 */
export class ManualVoteProvider implements VoteProvider {
  private listeners = new Set<(snapshot: VoteSnapshot) => void>();
  private snapshot: VoteSnapshot = idleSnapshot();

  start(_roundId: string): void {
    this.emit({ ...idleSnapshot(), status: "manual" });
  }

  stop(): void {
    this.emit(idleSnapshot());
  }

  subscribe(cb: (snapshot: VoteSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.snapshot);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * 主持人輸入票數或百分比皆可；內部一律依比例正規化成加總 100 的百分比。
   * 不足 100 或超過 100 都會被正規化；全部為 0 時 percents 全為 0。
   */
  setPercents(input: Partial<Record<OptionKey, number>>): void {
    const counts = normalizeCounts(input);
    const total = OPTION_KEYS.reduce((sum, k) => sum + counts[k], 0);
    this.emit({
      counts,
      total,
      percents: computePercents(counts),
      status: "manual",
      updatedAt: Date.now(),
    });
  }

  private emit(snapshot: VoteSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
