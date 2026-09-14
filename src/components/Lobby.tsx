import { useState } from "react";

export interface LobbyProps {
  emblemSrc: string;
  title: string;
  onStart: (contestantName: string) => void;
  onOpenSettings: () => void;
  onOpenLeaderboard?: () => void;
  /** 選拔賽帶過來的前 3 名：顯示成按鈕，點一下帶入名字 */
  finalists?: string[];
  /** 這一輪已經挑戰過的名字（標上「已挑戰」） */
  playedNames?: string[];
}

/** 輸入參賽者名字、開始新的一場、進入設定、開啟排行榜 */
export default function Lobby({
  emblemSrc,
  title,
  onStart,
  onOpenSettings,
  onOpenLeaderboard,
  finalists = [],
  playedNames = [],
}: LobbyProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim() || "挑戰者";
    onStart(trimmed);
  };

  return (
    <div className="tpi-lobby">
      <img className="tpi-lobby__emblem" src={emblemSrc} alt="司法官學院院徽" />
      <h1 className="tpi-lobby__title">{title}</h1>
      {finalists.length > 0 && (
        <div className="tpi-lobby__finalists" role="group" aria-label="選拔賽晉級名單">
          <span className="tpi-lobby__finalists-label">選拔賽晉級（點名字帶入）</span>
          {finalists.map((finalist, i) => {
            const played = playedNames.includes(finalist);
            return (
              <button
                key={finalist}
                type="button"
                className={`tpi-finalist${played ? " tpi-finalist--played" : ""}${name === finalist ? " tpi-finalist--active" : ""}`}
                aria-pressed={name === finalist}
                onClick={() => setName(finalist)}
              >
                <span className="tpi-finalist__rank">第 {i + 1} 名</span>
                {finalist}
                {played && <span className="tpi-finalist__played">已挑戰</span>}
              </button>
            );
          })}
        </div>
      )}
      <form className="tpi-lobby__form" onSubmit={handleSubmit}>
        <label htmlFor="contestant-name" className="sr-only">
          參賽者名字
        </label>
        <input
          id="contestant-name"
          className="tpi-lobby__input"
          type="text"
          placeholder="請輸入參賽者（或隊伍）名字"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />
        <div className="tpi-lobby__actions">
          <button type="submit" className="tpi-btn">
            開始新的一場
          </button>
          <button type="button" className="tpi-btn tpi-btn--outline" onClick={onOpenSettings}>
            設定
          </button>
          {onOpenLeaderboard && (
            <button type="button" className="tpi-btn tpi-btn--outline" onClick={onOpenLeaderboard}>
              排行榜
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
