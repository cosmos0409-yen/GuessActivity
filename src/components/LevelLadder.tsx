export interface LevelLadderProps {
  levels: number;
  currentLevel: number;
  clearedLevels: number;
  safeLevel: number;
}

/** 5 格關卡階梯；保底關有盾牌記號；已通過的格子亮金色 */
export default function LevelLadder({ levels, currentLevel, clearedLevels, safeLevel }: LevelLadderProps) {
  const steps = Array.from({ length: levels }, (_, i) => i + 1);
  return (
    <nav className="tpi-ladder" aria-label="關卡進度">
      {steps.map((level, i) => {
        const cleared = level <= clearedLevels;
        const isCurrent = level === currentLevel;
        const classes = ["tpi-ladder__step"];
        if (cleared) classes.push("tpi-ladder__step--cleared");
        if (isCurrent) classes.push("tpi-ladder__step--current");
        return (
          <span key={level} style={{ display: "flex", alignItems: "center" }}>
            <span
              className={classes.join(" ")}
              aria-current={isCurrent ? "step" : undefined}
              title={`第 ${level} 關${level === safeLevel ? "（保底關）" : ""}`}
            >
              第{level}關
              {level === safeLevel && (
                <span className="tpi-ladder__shield" aria-hidden="true">
                  🛡️
                </span>
              )}
            </span>
            {i < steps.length - 1 && <span className="tpi-ladder__connector" aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}
