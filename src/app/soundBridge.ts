// 音效介接層。
//
// src/audio/SoundManager.ts 已經完成（15 個合成音效 + 音檔覆蓋機制），
// 這裡把 UI 會呼叫的介面轉接到真正的 soundManager；呼叫端（元件、App.tsx）不用改。
//
// 涵蓋的事件：intro、pickCategory、questionShow、tick、tickUrgent、countdownBed、
// lifeline、lock、suspense、correct、wrong、explanation、levelUp、champion、timeUp。

import soundManager from "../audio/SoundManager";

export type SfxName =
  | "intro"
  | "pickCategory"
  | "questionShow"
  | "tick"
  | "tickUrgent"
  | "countdownBed"
  | "lifeline"
  | "lock"
  | "suspense"
  | "correct"
  | "wrong"
  | "explanation"
  | "levelUp"
  | "champion"
  | "timeUp";

export interface SfxBridge {
  /** 播放一次性音效事件（目前為 no-op，等 SoundManager 接上後才會真的出聲）。 */
  play(name: SfxName): void;
  /** 開始倒數背景音樂（loop）。 */
  startBed(): void;
  /** 切換倒數背景音樂是否為「緊張版」（最後 10 秒）。 */
  setBedUrgent(urgent: boolean): void;
  /** 停止倒數背景音樂。 */
  stopBed(): void;
  /** 在使用者手勢（點擊）中呼叫一次，之後才能真正出聲。 */
  unlock(): void;
}

/** 實際轉接到 soundManager 的實作。 */
export const sfx: SfxBridge = {
  play(name: SfxName): void {
    soundManager.play(name);
  },
  startBed(): void {
    soundManager.startBed();
  },
  setBedUrgent(urgent: boolean): void {
    soundManager.setBedUrgent(urgent);
  },
  stopBed(): void {
    soundManager.stopBed();
  },
  unlock(): void {
    soundManager.unlock();
    // 嘗試載入 public/sfx/ 底下的正式音檔（若不存在就自動退回合成音）。
    void soundManager.preloadOverrides();
  },
};

export default sfx;
