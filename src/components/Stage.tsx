import type { ReactNode } from "react";

export interface StageProps {
  title: string;
  emblemSrc: string;
  /** 目前挑戰者（或隊伍）名字；遊戲進行中要讓主持人與觀眾都看得到是誰在挑戰 */
  contestantName?: string;
  children: ReactNode;
}

/** 深藍漸層舞台背景，左上角院徽與標題，內容置於 content 區 */
export default function Stage({ title, emblemSrc, contestantName, children }: StageProps) {
  return (
    <div className="tpi-stage">
      <div className="tpi-stage__glow" aria-hidden="true" />
      <div className="tpi-stage__content">
        <header className="tpi-stage__header">
          <img className="tpi-stage__emblem" src={emblemSrc} alt="司法官學院院徽" />
          <div>
            <h1 className="tpi-stage__title">{title}</h1>
            <p className="tpi-stage__subtitle">Academy for the Judiciary, Ministry of Justice</p>
          </div>
          {contestantName && (
            <p className="tpi-stage__contestant">
              挑戰者：<strong>{contestantName}</strong>
            </p>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
