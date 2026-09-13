import { HOTKEY_TABLE } from "../hooks/hotkeys";

export interface HotkeyHelpOverlayProps {
  onClose: () => void;
}

/** 按「?」顯示的快捷鍵說明浮層；內容直接從 HOTKEY_TABLE 產生，不重複維護第二份清單。 */
export default function HotkeyHelpOverlay({ onClose }: HotkeyHelpOverlayProps) {
  return (
    <div className="tpi-hotkey-help" role="dialog" aria-label="快捷鍵說明" onClick={onClose}>
      <div className="tpi-hotkey-help__panel" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "var(--tpi-font-heading)", margin: 0 }}>快捷鍵</h2>
        <table className="tpi-hotkey-help__table">
          <tbody>
            {HOTKEY_TABLE.map((entry) => (
              <tr key={entry.id}>
                <td className="tpi-hotkey-help__key">{entry.display}</td>
                <td>{entry.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="tpi-btn tpi-btn--outline" onClick={onClose}>
          關閉（按 ? 或點空白處也可以）
        </button>
      </div>
    </div>
  );
}
