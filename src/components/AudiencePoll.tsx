import type { OptionKey, VoteSnapshot } from "../vote/VoteProvider";

export interface AudiencePollProps {
  /** 線上投票啟用時才有值；用來顯示 QR code */
  qrDataUrl?: string;
  snapshot: VoteSnapshot;
  remainingSeconds: number;
  onFinishEarly: () => void;
  manualMode: boolean;
  onToggleManual: () => void;
  manualValues: Record<OptionKey, string>;
  onManualChange: (option: OptionKey, value: string) => void;
}

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

/** 左側 QR（線上投票啟用時）+ 右側 4 條長條圖；20 秒收票倒數；提早收票；手動輸入切換 */
export default function AudiencePoll({
  qrDataUrl,
  snapshot,
  remainingSeconds,
  onFinishEarly,
  manualMode,
  onToggleManual,
  manualValues,
  onManualChange,
}: AudiencePollProps) {
  const showError = snapshot.status === "error";

  return (
    <section className="tpi-poll" aria-label="全場一起協助投票">
      {qrDataUrl && !manualMode && (
        <div className="tpi-poll__qr">
          <img src={qrDataUrl} alt="投票 QR code，請用手機掃描投票" />
          <span>掃碼投票</span>
        </div>
      )}

      <div className="tpi-poll__bars">
        {showError && <p className="tpi-poll__error">線上投票連線異常，已自動切換為主持人手動輸入。</p>}
        {OPTION_KEYS.map((key) => {
          const pct = snapshot.percents[key];
          return (
            <div className="tpi-poll__bar-row" key={key}>
              <span className="tpi-poll__bar-label">{key}</span>
              <div className="tpi-poll__bar-track">
                <div
                  className={`tpi-poll__bar-fill tpi-poll__bar-fill--${key}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="tpi-poll__bar-pct">{pct}%</span>
              {manualMode && (
                <input
                  className="tpi-poll__manual-input"
                  type="number"
                  min={0}
                  max={100}
                  value={manualValues[key]}
                  onChange={(e) => onManualChange(key, e.target.value)}
                  aria-label={`選項 ${key} 手動百分比`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="tpi-poll__controls">
        <span style={{ fontWeight: 700 }}>
          {manualMode ? "手動輸入中" : `收票倒數 ${remainingSeconds} 秒`}
        </span>
        <button type="button" className="tpi-btn" onClick={onFinishEarly}>
          提早收票
        </button>
        {qrDataUrl && (
          <button type="button" className="tpi-btn tpi-btn--outline" onClick={onToggleManual}>
            {manualMode ? "改用線上投票" : "改用手動輸入"}
          </button>
        )}
      </div>
    </section>
  );
}
