import { useState } from "react";
import type { VoteSettings } from "../vote/voteSettings";
import type { RuleSettings, TimeoutPolicy } from "../app/settings";
import type { QuestionBank } from "../data/types";
import { getRemoteUrls } from "../data/questionSource";
import soundManager from "../audio/SoundManager";

export interface SettingsModalProps {
  voteSettings: VoteSettings;
  onSaveVoteSettings: (settings: VoteSettings) => void;

  ruleSettings: RuleSettings;
  onSaveRuleSettings: (settings: RuleSettings) => void;

  title: string;
  onSaveTitle: (title: string) => void;

  /** 目前題庫（用來顯示「目前題庫」摘要，即使沒有按過重新讀取也能看到）*/
  bank: QuestionBank | null;
  /** 按下「重新讀取題庫」：把兩個網址存起來並重新載入；成功回傳新的題庫，失敗要丟出錯誤 */
  onReloadQuestionBank: (questionsUrl: string, categoriesUrl: string) => Promise<QuestionBank>;

  onResetUsedQuestions: () => void;
  onOpenHostCards: () => void;
  onOpenLeaderboard: () => void;

  /** 靜音是「受控」的（由 App 統一管理，跟 M 快捷鍵共用同一個狀態），不要在這裡另外存一份。 */
  muted: boolean;
  onMutedChange: (muted: boolean) => void;

  onClose: () => void;
}

const SOURCE_LABEL: Record<QuestionBank["source"], string> = {
  remote: "遠端試算表",
  cache: "本機快取",
  bundled: "內建範例題庫",
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * 設定頁：主標題、題庫網址與重新讀取、線上投票、規則、音量、彩排模式、
 * 重置已使用題目、排行榜／主持人手卡的進入點。所有存取都經過各自模組的
 * load/save（已經個別包 try/catch），這裡不直接碰 localStorage。
 */
export default function SettingsModal({
  voteSettings,
  onSaveVoteSettings,
  ruleSettings,
  onSaveRuleSettings,
  title,
  onSaveTitle,
  bank,
  onReloadQuestionBank,
  onResetUsedQuestions,
  onOpenHostCards,
  onOpenLeaderboard,
  muted,
  onMutedChange,
  onClose,
}: SettingsModalProps) {
  const remoteUrls = getRemoteUrls();

  const [titleValue, setTitleValue] = useState(title);

  const [questionsUrl, setQuestionsUrl] = useState(remoteUrls.questionsUrl ?? "");
  const [categoriesUrl, setCategoriesUrl] = useState(remoteUrls.categoriesUrl ?? "");
  const [reloadState, setReloadState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [reloadedBank, setReloadedBank] = useState<QuestionBank | null>(null);

  const [formUrl, setFormUrl] = useState(voteSettings.formUrl);
  const [statsUrl, setStatsUrl] = useState(voteSettings.statsUrl);
  const [voteEnabled, setVoteEnabled] = useState(voteSettings.enabled);

  const [seconds, setSeconds] = useState(String(ruleSettings.seconds));
  const [safeLevel, setSafeLevel] = useState(String(ruleSettings.safeLevel));
  const [timeoutPolicy, setTimeoutPolicy] = useState<TimeoutPolicy>(ruleSettings.timeoutPolicy);
  const [rehearsal, setRehearsal] = useState(ruleSettings.rehearsal);

  const [volume, setVolume] = useState(() => soundManager.getVolume());

  const displayedBank = reloadedBank ?? bank;

  const handleReload = async () => {
    setReloadState("loading");
    setReloadError(null);
    try {
      const next = await onReloadQuestionBank(questionsUrl.trim(), categoriesUrl.trim());
      setReloadedBank(next);
      setReloadState("done");
    } catch (err) {
      setReloadError(err instanceof Error ? err.message : String(err));
      setReloadState("error");
    }
  };

  const handleResetUsed = () => {
    if (window.confirm("確定要重置已使用的題目嗎？之後所有題目都可能被重新抽到。")) {
      onResetUsedQuestions();
    }
  };

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    soundManager.setVolume(value);
  };

  const handleMutedChange = (value: boolean) => {
    soundManager.setMuted(value);
    onMutedChange(value);
  };

  const handleSave = () => {
    if (titleValue.trim()) onSaveTitle(titleValue.trim());

    onSaveVoteSettings({ ...voteSettings, formUrl, statsUrl, enabled: voteEnabled });

    const secondsNum = Number(seconds);
    const safeLevelNum = Number(safeLevel);
    onSaveRuleSettings({
      seconds: Number.isFinite(secondsNum) && secondsNum > 0 ? Math.round(secondsNum) : ruleSettings.seconds,
      safeLevel: Number.isFinite(safeLevelNum) && safeLevelNum > 0 ? Math.round(safeLevelNum) : ruleSettings.safeLevel,
      timeoutPolicy,
      rehearsal,
    });

    onClose();
  };

  return (
    <div className="tpi-settings-modal" role="dialog" aria-label="設定">
      <div className="tpi-settings-modal__panel tpi-settings-modal__panel--wide">
        <h2 style={{ fontFamily: "var(--tpi-font-heading)", margin: 0 }}>設定</h2>

        <section className="tpi-settings-section">
          <h3>基本</h3>
          <label>
            主標題
            <input value={titleValue} onChange={(e) => setTitleValue(e.target.value)} placeholder="司法官學院 闖關大挑戰" />
          </label>
        </section>

        <section className="tpi-settings-section">
          <h3>題庫</h3>
          <label>
            題目 CSV 網址
            <input
              value={questionsUrl}
              onChange={(e) => setQuestionsUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/.../pub?output=csv"
            />
          </label>
          <label>
            題型 CSV 網址
            <input
              value={categoriesUrl}
              onChange={(e) => setCategoriesUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/.../pub?output=csv"
            />
          </label>
          <div className="tpi-lobby__actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="tpi-btn tpi-btn--outline" onClick={handleReload} disabled={reloadState === "loading"}>
              {reloadState === "loading" ? "讀取中…" : "重新讀取題庫"}
            </button>
          </div>
          {reloadState === "error" && <p className="tpi-settings-error">讀取失敗：{reloadError}</p>}
          {displayedBank && (
            <p className="tpi-settings-summary">
              目前題庫來源：{SOURCE_LABEL[displayedBank.source]}｜讀取時間：{formatTime(displayedBank.fetchedAt)}｜
              題數：{displayedBank.questions.length}｜警告：{displayedBank.warnings.length} 則
            </p>
          )}
        </section>

        <section className="tpi-settings-section">
          <h3>線上投票（全場一起協助）</h3>
          <label>
            <input type="checkbox" checked={voteEnabled} onChange={(e) => setVoteEnabled(e.target.checked)} />
            啟用線上投票（Google 表單）
          </label>
          <label>
            Google 表單網址樣板（用 {"{round}"} 佔位題號）
            <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://docs.google.com/forms/..." />
          </label>
          <label>
            Apps Script 統計網址
            <input value={statsUrl} onChange={(e) => setStatsUrl(e.target.value)} placeholder="https://script.google.com/macros/..." />
          </label>
        </section>

        <section className="tpi-settings-section">
          <h3>規則</h3>
          <label>
            每題秒數
            <input type="number" min={5} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
          </label>
          <label>
            保底關
            <input type="number" min={1} value={safeLevel} onChange={(e) => setSafeLevel(e.target.value)} />
          </label>
          <label>
            時間到的處理
            <select value={timeoutPolicy} onChange={(e) => setTimeoutPolicy(e.target.value as TimeoutPolicy)}>
              <option value="wrong">算答錯</option>
              <option value="host">交由主持人裁量</option>
            </select>
          </label>
        </section>

        <section className="tpi-settings-section">
          <h3>音效</h3>
          <label>
            音量
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
            />
          </label>
          <label>
            <input type="checkbox" checked={muted} onChange={(e) => handleMutedChange(e.target.checked)} />
            靜音
          </label>
        </section>

        <section className="tpi-settings-section">
          <h3>彩排模式</h3>
          <label>
            <input type="checkbox" checked={rehearsal} onChange={(e) => setRehearsal(e.target.checked)} />
            彩排模式（不標記已使用題目、不寫入排行榜；畫面角落會顯示「彩排中」浮水印）
          </label>
        </section>

        <section className="tpi-settings-section">
          <h3>維護</h3>
          <div className="tpi-lobby__actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="tpi-btn tpi-btn--outline" onClick={handleResetUsed}>
              重置已使用題目
            </button>
            <button type="button" className="tpi-btn tpi-btn--outline" onClick={onOpenLeaderboard}>
              排行榜與匯出
            </button>
            <button type="button" className="tpi-btn tpi-btn--outline" onClick={onOpenHostCards}>
              開啟主持人手卡
            </button>
          </div>
        </section>

        <div className="tpi-lobby__actions">
          <button type="button" className="tpi-btn" onClick={handleSave}>
            儲存
          </button>
          <button type="button" className="tpi-btn tpi-btn--outline" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
