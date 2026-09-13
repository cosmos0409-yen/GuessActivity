export interface HostBarAction {
  label: string;
  onClick: () => void;
  enabled: boolean;
  variant?: "primary" | "danger";
}

export interface HostBarProps {
  actions: HostBarAction[];
}

/** 畫面底部主持人操作列，各按鈕依 can() 啟用或停用 */
export default function HostBar({ actions }: HostBarProps) {
  return (
    <div className="tpi-hostbar" role="toolbar" aria-label="主持人操作">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`tpi-hostbar__btn${action.variant ? ` tpi-hostbar__btn--${action.variant}` : ""}`}
          disabled={!action.enabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
