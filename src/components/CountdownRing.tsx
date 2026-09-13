export interface CountdownRingProps {
  remainingMs: number;
  totalMs: number;
  /** 使用提示卡後不計時 */
  stopped: boolean;
}

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 30 秒圓環；最後 10 秒轉紅並脈動；使用提示卡後顯示「暫停 不計時」 */
export default function CountdownRing({ remainingMs, totalMs, stopped }: CountdownRingProps) {
  if (stopped) {
    return (
      <div className="tpi-countdown" role="status">
        <span className="tpi-countdown__notimer">⏸ 不計時</span>
      </div>
    );
  }

  const seconds = Math.ceil(remainingMs / 1000);
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - ratio);
  const urgent = remainingMs <= 10000 && remainingMs > 0;

  return (
    <div className="tpi-countdown" role="timer" aria-live="polite">
      <div className={`tpi-countdown-ring${urgent ? " tpi-countdown-ring--urgent" : ""}`}>
        <svg viewBox="0 0 120 120">
          <circle className="tpi-countdown-ring__track" cx="60" cy="60" r={RADIUS} />
          <circle
            className="tpi-countdown-ring__progress"
            cx="60"
            cy="60"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="tpi-countdown-ring__label">{seconds}</span>
      </div>
    </div>
  );
}
