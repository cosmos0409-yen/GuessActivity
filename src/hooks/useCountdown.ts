// 可暫停的倒數：核心邏輯拆成純類別 CountdownClock（可注入 now()，方便測試），
// useCountdown 這個 hook 只負責用 setInterval 定時呼叫 tick() 並同步到 React state。
//
// 校正方式：每次 tick() 都用「現在的 now() 減去上次量測時間點」算出實際經過的毫秒數，
// 而不是假設每次 interval 都精準地過了 intervalMs 毫秒 —— 這樣 setInterval 本身的延遲
// 不會累積誤差；暫停時先 flush 一次已經過的時間，恢復時重新記錄起算點，
// 所以「暫停後繼續」的誤差只來自單次量測的浮點誤差，不會隨時間累加。

import { useCallback, useEffect, useRef, useState } from "react";

export interface CountdownClockOptions {
  /** 倒數總毫秒數 */
  totalMs: number;
  /** 可注入的時間來源，預設 performance.now；測試時傳入假時鐘 */
  now?: () => number;
  onTick?: (remainingMs: number) => void;
  /** 剩餘時間第一次 <= 10000ms 時觸發一次 */
  onFinal10?: () => void;
  onExpire?: () => void;
}

/**
 * 倒數的核心邏輯，不依賴 React、不依賴真實時鐘，方便單元測試。
 * 使用方式：start() 開始、pause()/resume() 暫停恢復、reset() 重設、
 * stop() 永久結束（提示卡用：之後 tick() 不會再做任何事，也不會觸發 onExpire）。
 * tick() 由外部（例如 setInterval 或測試）主動呼叫來推進時間。
 */
export class CountdownClock {
  private totalMs: number;
  private readonly now: () => number;
  private readonly onTick?: (remainingMs: number) => void;
  private readonly onFinal10?: () => void;
  private readonly onExpire?: () => void;

  private remaining: number;
  private running = false;
  private finished = false;
  /** 永久停止：提示卡用，之後任何 tick/start/resume 都不再生效 */
  private stopped = false;
  private final10Fired = false;
  /** 目前這段「連續運行」的起算時間點（now() 的值），暫停時為 null */
  private lastMeasuredAt: number | null = null;

  constructor(options: CountdownClockOptions) {
    this.totalMs = options.totalMs;
    this.now = options.now ?? (() => performance.now());
    this.onTick = options.onTick;
    this.onFinal10 = options.onFinal10;
    this.onExpire = options.onExpire;
    this.remaining = options.totalMs;
  }

  get remainingMs(): number {
    return this.remaining;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  start(): void {
    if (this.stopped || this.finished || this.running) return;
    this.running = true;
    this.lastMeasuredAt = this.now();
  }

  pause(): void {
    if (!this.running) return;
    this.tick();
    this.running = false;
    this.lastMeasuredAt = null;
  }

  resume(): void {
    if (this.stopped || this.finished || this.running) return;
    this.running = true;
    this.lastMeasuredAt = this.now();
  }

  /** 重設倒數；預設回到建構時的總時長，可傳入新的總毫秒數（例如換題） */
  reset(totalMs?: number): void {
    if (totalMs !== undefined) this.totalMs = totalMs;
    this.remaining = this.totalMs;
    this.running = false;
    this.finished = false;
    this.stopped = false;
    this.final10Fired = false;
    this.lastMeasuredAt = null;
  }

  /** 永久結束：提示卡用。這一題不再計時，也不會再觸發時間到 */
  stop(): void {
    this.running = false;
    this.stopped = true;
    this.lastMeasuredAt = null;
  }

  /**
   * 推進時間並依目前實際經過的毫秒數更新 remaining。
   * 沒有在跑（暫停/停止/已結束）時呼叫不會有任何效果。
   */
  tick(): number {
    if (!this.running || this.finished || this.stopped) return this.remaining;

    const nowMs = this.now();
    const elapsed = nowMs - (this.lastMeasuredAt ?? nowMs);
    this.lastMeasuredAt = nowMs;
    this.remaining = Math.max(0, this.remaining - elapsed);

    this.onTick?.(this.remaining);

    if (!this.final10Fired && this.remaining <= 10000) {
      this.final10Fired = true;
      this.onFinal10?.();
    }

    if (this.remaining <= 0) {
      this.running = false;
      this.finished = true;
      this.onExpire?.();
    }

    return this.remaining;
  }
}

export interface UseCountdownOptions {
  /** 倒數秒數 */
  seconds: number;
  onTick?: (remainingMs: number) => void;
  onFinal10?: () => void;
  onExpire?: () => void;
  /** 可注入的時間來源，預設 performance.now */
  now?: () => number;
  /** setInterval 的呼叫間隔（毫秒），預設 100ms；不影響精確度，只影響 UI 更新頻率 */
  intervalMs?: number;
}

export interface UseCountdownResult {
  remainingMs: number;
  isRunning: boolean;
  isFinished: boolean;
  isStopped: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (seconds?: number) => void;
  /** 永久結束（提示卡用） */
  stop: () => void;
}

export function useCountdown(options: UseCountdownOptions): UseCountdownResult {
  const { seconds, onTick, onFinal10, onExpire, now, intervalMs = 100 } = options;

  const clockRef = useRef<CountdownClock | null>(null);
  if (clockRef.current === null) {
    clockRef.current = new CountdownClock({
      totalMs: seconds * 1000,
      now,
      onTick,
      onFinal10,
      onExpire,
    });
  }

  const [remainingMs, setRemainingMs] = useState(() => clockRef.current!.remainingMs);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isStopped, setIsStopped] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRunningInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const sync = useCallback(() => {
    const clock = clockRef.current!;
    setRemainingMs(clock.remainingMs);
    setIsRunning(clock.isRunning);
    setIsFinished(clock.isFinished);
    setIsStopped(clock.isStopped);
  }, []);

  const tick = useCallback(() => {
    const clock = clockRef.current!;
    clock.tick();
    sync();
    if (!clock.isRunning) {
      clearRunningInterval();
    }
  }, [sync, clearRunningInterval]);

  const ensureInterval = useCallback(() => {
    if (intervalRef.current === null) {
      intervalRef.current = setInterval(tick, intervalMs);
    }
  }, [tick, intervalMs]);

  const start = useCallback(() => {
    clockRef.current!.start();
    ensureInterval();
    sync();
  }, [ensureInterval, sync]);

  const pause = useCallback(() => {
    clockRef.current!.pause();
    clearRunningInterval();
    sync();
  }, [sync, clearRunningInterval]);

  const resume = useCallback(() => {
    clockRef.current!.resume();
    ensureInterval();
    sync();
  }, [ensureInterval, sync]);

  const reset = useCallback(
    (newSeconds?: number) => {
      clockRef.current!.reset(newSeconds !== undefined ? newSeconds * 1000 : undefined);
      clearRunningInterval();
      sync();
    },
    [sync, clearRunningInterval],
  );

  const stop = useCallback(() => {
    clockRef.current!.stop();
    clearRunningInterval();
    sync();
  }, [sync, clearRunningInterval]);

  useEffect(() => {
    return () => {
      clearRunningInterval();
    };
  }, [clearRunningInterval]);

  return { remainingMs, isRunning, isFinished, isStopped, start, pause, resume, reset, stop };
}
