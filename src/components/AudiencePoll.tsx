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
  /** 彈窗會蓋住題目畫面，所以把題目本文與四個選項文字一起放進彈窗，觀眾投票時看得到題目 */
  questionText: string;
  optionTexts: Record<OptionKey, string>;
  /** 已經被「刪除一個選項」刪掉的選項：彈窗裡淡化顯示 */
  removedOption?: OptionKey;
  /** 收起彈窗（繼續收票，改成角落的小視窗） */
  onMinimize: () => void;
}

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

/**
 * 全場一起協助：彈出視窗。
 * 上方題目本文＋「收起」；左側大 QR code（線上投票時）；右側每個選項一條長條（含選項文字）；
 * 下方收票倒數、提早收票、線上／手動切換。
 * 收起後改由 PollChip 顯示在右側欄，票照收；收票結束後百分比會留在題目畫面的四個選項上（OptionGrid）。
 */
export default function AudiencePoll({
  qrDataUrl,
  snapshot,
  remainingSeconds,
  onFinishEarly,
  manualMode,
  onToggleManual,
  manualValues,
  onManualChange,
  questionText,
  optionTexts,
  removedOption,
  onMinimize,
}: AudiencePollProps) {
  const showError = snapshot.status === "error";

  return (
    <div className="tpi-poll-modal" role="dialog" aria-label="全場一起協助投票">
      <section className="tpi-poll-modal__card">
        <header className="tpi-poll-modal__head">
          <p className="tpi-poll-modal__question">{questionText}</p>
          <button type="button" className="tpi-btn tpi-btn--outline" onClick={onMinimize}>
            收起
          </button>
        </header>

        <div className="tpi-poll-modal__body">
          {qrDataUrl && !manualMode && (
            <div className="tpi-poll__qr">
              <img src={qrDataUrl} alt="投票 QR code，請用手機掃描投票" />
              <span>手機掃碼投票</span>
            </div>
          )}

          <div className="tpi-poll__bars">
            {showError && <p className="tpi-poll__error">線上投票連線異常，已自動切換為主持人手動輸入。</p>}
            {OPTION_KEYS.map((key) => {
              const pct = snapshot.percents[key];
              return (
                <div
                  className={`tpi-poll__bar-row${removedOption === key ? " tpi-poll__bar-row--removed" : ""}`}
                  key={key}
                >
                  <span className="tpi-poll__bar-label">{key}</span>
                  <span className="tpi-poll__bar-text">{optionTexts[key]}</span>
                  <div className="tpi-poll__bar-track">
                    <div className={`tpi-poll__bar-fill tpi-poll__bar-fill--${key}`} style={{ width: `${pct}%` }} />
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
        </div>

        <div className="tpi-poll__controls">
          <span className="tpi-poll__status">
            {manualMode ? "手動輸入中" : `收票倒數 ${remainingSeconds} 秒・已收 ${snapshot.total} 票`}
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
    </div>
  );
}

export interface PollChipProps {
  remainingSeconds: number;
  total: number;
  manualMode: boolean;
  onExpand: () => void;
  onFinishEarly: () => void;
}

/** 收起後的小視窗：放在右側欄（倒數圓環與提示卡那一欄），不蓋住題目與選項，票照收 */
export function PollChip({ remainingSeconds, total, manualMode, onExpand, onFinishEarly }: PollChipProps) {
  return (
    <aside className="tpi-poll-chip" aria-label="投票進行中">
      <strong>🙌 投票進行中</strong>
      <span>{manualMode ? "手動輸入中" : `剩 ${remainingSeconds} 秒・${total} 票`}</span>
      <div className="tpi-poll-chip__actions">
        <button type="button" className="tpi-btn" onClick={onExpand}>
          展開
        </button>
        <button type="button" className="tpi-btn tpi-btn--outline" onClick={onFinishEarly}>
          收票
        </button>
      </div>
    </aside>
  );
}
