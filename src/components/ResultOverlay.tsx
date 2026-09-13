export type ResultKind = "levelCleared" | "gameOver" | "walkedAway" | "champion";

export interface ResultOverlayProps {
  kind: ResultKind;
  level: number;
  clearedLevels: number;
  onContinue?: () => void;
  onWalkAway?: () => void;
  onNewGame?: () => void;
  /** 結算畫面（gameOver/walkedAway/champion）可以直接查看排行榜 */
  onOpenLeaderboard?: () => void;
}

const CONFETTI_COLORS = ["var(--tpi-green)", "var(--tpi-red)", "var(--tpi-navy)", "var(--tpi-gold)"];

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div className="tpi-result__confetti" aria-hidden="true">
      {pieces.map((i) => (
        <span
          key={i}
          style={{
            left: `${(i * 97) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDuration: `${2.5 + (i % 5) * 0.4}s`,
            animationDelay: `${(i % 7) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

/** 過關/答錯/帶走/全破覆蓋層；全破時用 CSS/SVG 獨角獸剪影＋金色彩帶動畫 */
export default function ResultOverlay({
  kind,
  level,
  clearedLevels,
  onContinue,
  onWalkAway,
  onNewGame,
  onOpenLeaderboard,
}: ResultOverlayProps) {
  if (kind === "levelCleared") {
    return (
      <div className="tpi-result" role="alertdialog" aria-label="過關">
        <h2 className="tpi-result__title tpi-result__title--good">🎉 過關！</h2>
        <p className="tpi-result__subtitle">恭喜通過第 {level} 關，要繼續挑戰下一關，還是帶走目前的獎勵？</p>
        <div className="tpi-result__actions">
          <button type="button" className="tpi-btn" onClick={onContinue}>
            繼續挑戰
          </button>
          <button type="button" className="tpi-btn tpi-btn--outline" onClick={onWalkAway}>
            帶走獎勵
          </button>
        </div>
      </div>
    );
  }

  if (kind === "champion") {
    return (
      <div className="tpi-result" role="alertdialog" aria-label="全破">
        <Confetti />
        <svg
          className="tpi-result__unicorn"
          viewBox="0 0 200 160"
          role="img"
          aria-label="慶祝獨角獸剪影"
        >
          <g fill="var(--tpi-gold)">
            <path d="M40 140 C30 120 35 90 60 80 C55 60 70 40 90 42 L110 20 L108 44 C130 46 140 65 132 85 C150 90 158 110 148 128 C140 142 120 148 100 144 C80 148 55 148 40 140 Z" />
            <polygon points="106,20 118,32 100,36" fill="var(--tpi-cream)" />
          </g>
        </svg>
        <h2 className="tpi-result__title tpi-result__title--good">👑 全破！最強挑戰者！</h2>
        <p className="tpi-result__subtitle">五關全部過關，太厲害了！</p>
        <div className="tpi-result__actions">
          <button type="button" className="tpi-btn" onClick={onNewGame}>
            開始新的一場
          </button>
          {onOpenLeaderboard && (
            <button type="button" className="tpi-btn tpi-btn--outline" onClick={onOpenLeaderboard}>
              查看排行榜
            </button>
          )}
        </div>
      </div>
    );
  }

  // gameOver / walkedAway：沒有保底關概念，答錯一律帶走「答錯之前已經通過的關數」的獎勵，只是不能再繼續挑戰。
  const isWalkedAway = kind === "walkedAway";
  return (
    <div className="tpi-result" role="alertdialog" aria-label={isWalkedAway ? "帶走獎勵" : "答錯"}>
      <h2 className={`tpi-result__title ${isWalkedAway ? "tpi-result__title--good" : "tpi-result__title--bad"}`}>
        {isWalkedAway ? "🏅 順利帶走獎勵" : "💥 挑戰結束"}
      </h2>
      <p className="tpi-result__subtitle">
        {isWalkedAway
          ? `已通過 ${clearedLevels} 關，帶走獎勵離開。`
          : clearedLevels > 0
            ? `成功通過 ${clearedLevels} 關，獎勵帶走！`
            : "很可惜，這次沒有通過任何關卡，下次再來挑戰！"}
      </p>
      <div className="tpi-result__actions">
        <button type="button" className="tpi-btn" onClick={onNewGame}>
          開始新的一場
        </button>
        {onOpenLeaderboard && (
          <button type="button" className="tpi-btn tpi-btn--outline" onClick={onOpenLeaderboard}>
            查看排行榜
          </button>
        )}
      </div>
    </div>
  );
}
