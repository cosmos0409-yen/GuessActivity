import type { CSSProperties } from "react";

export interface PhoneAFriendProps {
  onEnd: () => void;
}

/** 全螢幕半透明覆蓋層：「求助中…」動畫與「結束求助」按鈕 */
export default function PhoneAFriend({ onEnd }: PhoneAFriendProps) {
  return (
    <div className="tpi-phone-overlay" role="dialog" aria-label="指定人幫幫忙">
      <div className="tpi-phone-overlay__icon" aria-hidden="true">
        📞
      </div>
      <p className="tpi-phone-overlay__text">
        求助中
        <span className="tpi-phone-overlay__dots">
          <span style={{ "--i": 0 } as CSSProperties}>.</span>
          <span style={{ "--i": 1 } as CSSProperties}>.</span>
          <span style={{ "--i": 2 } as CSSProperties}>.</span>
        </span>
      </p>
      <button type="button" className="tpi-btn" onClick={onEnd}>
        結束求助
      </button>
    </div>
  );
}
