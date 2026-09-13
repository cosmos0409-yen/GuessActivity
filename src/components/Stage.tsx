import type { ReactNode } from "react";

export interface StageProps {
  title: string;
  emblemSrc: string;
  children: ReactNode;
}

/** 深藍漸層舞台背景，左上角院徽與標題，內容置於 content 區 */
export default function Stage({ title, emblemSrc, children }: StageProps) {
  return (
    <div className="tpi-stage">
      <div className="tpi-stage__glow" aria-hidden="true" />
      <div className="tpi-stage__content">
        <header className="tpi-stage__header">
          <img className="tpi-stage__emblem" src={emblemSrc} alt="司法官學院院徽" />
          <div>
            <h1 className="tpi-stage__title">{title}</h1>
            <p className="tpi-stage__subtitle">JUDICIAL &amp; PROSECUTORIAL EXCELLENCE</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
