import type { LifelineKey } from "../state/gameMachine";

export interface LifelineDockProps {
  available: Record<LifelineKey, boolean>;
  /** 目前 can() 是否允許使用（依 phase 判斷） */
  usable: boolean;
  onUseFiftyRemove: () => void;
  onUsePhoneFriend: () => void;
  onUseAudiencePoll: () => void;
}

const ITEMS: Array<{ key: LifelineKey; icon: string; label: string }> = [
  { key: "fiftyRemove", icon: "⚖️", label: "刪除一個選項" },
  { key: "phoneFriend", icon: "📞", label: "指定人幫幫忙" },
  { key: "audiencePoll", icon: "🙌", label: "全場一起協助" },
];

/** 右下角 3 張金框圓角卡；用過的卡蓋上「已使用」印章並變灰；只有 can() 允許時才能點 */
export default function LifelineDock({
  available,
  usable,
  onUseFiftyRemove,
  onUsePhoneFriend,
  onUseAudiencePoll,
}: LifelineDockProps) {
  const handlers: Record<LifelineKey, () => void> = {
    fiftyRemove: onUseFiftyRemove,
    phoneFriend: onUsePhoneFriend,
    audiencePoll: onUseAudiencePoll,
  };

  return (
    <div className="tpi-lifeline-dock" aria-label="提示卡">
      {ITEMS.map(({ key, icon, label }) => {
        const isAvailable = available[key];
        const disabled = !isAvailable || !usable;
        return (
          <button
            key={key}
            type="button"
            className="tpi-lifeline-dock__card"
            disabled={disabled}
            onClick={handlers[key]}
            aria-label={`${label}${isAvailable ? "" : "（已使用）"}`}
          >
            <span className="tpi-lifeline-dock__icon" aria-hidden="true">
              {icon}
            </span>
            <span>{label}</span>
            {!isAvailable && <span className="tpi-lifeline-dock__used-stamp">已使用</span>}
          </button>
        );
      })}
    </div>
  );
}
