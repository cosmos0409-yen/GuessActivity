import { useEffect, useState } from "react";
import { SOUND_NAMES, soundManager } from "./SoundManager";
import type { SoundName } from "./SoundManager";

/**
 * 開發用試聽頁元件：每個音效一個按鈕，外加音量/靜音/背景音樂/urgent 切換控制。
 * 這階段不接到 App.tsx，只透過 soundlab-main.tsx 獨立掛載使用。
 */
export default function SoundLab() {
  const [unlocked, setUnlocked] = useState(false);
  const [volume, setVolume] = useState(() => soundManager.getVolume());
  const [muted, setMuted] = useState(() => soundManager.isMuted());
  const [bedOn, setBedOn] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [preloadDone, setPreloadDone] = useState(false);

  useEffect(() => {
    soundManager
      .preloadOverrides()
      .catch(() => {
        /* 忽略，preload 失敗一律退回合成音 */
      })
      .finally(() => setPreloadDone(true));
  }, []);

  const handleUnlock = (): void => {
    soundManager.unlock();
    setUnlocked(true);
  };

  const handlePlay = (name: SoundName): void => {
    soundManager.play(name);
  };

  const handleVolumeChange = (value: number): void => {
    setVolume(value);
    soundManager.setVolume(value);
  };

  const handleMutedChange = (value: boolean): void => {
    setMuted(value);
    soundManager.setMuted(value);
  };

  const handleBedToggle = (): void => {
    if (bedOn) {
      soundManager.stopBed();
      setBedOn(false);
    } else {
      soundManager.startBed();
      setBedOn(true);
    }
  };

  const handleUrgentToggle = (): void => {
    const next = !urgent;
    setUrgent(next);
    soundManager.setBedUrgent(next);
  };

  const handleStopAll = (): void => {
    soundManager.stopAll();
    setBedOn(false);
  };

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        background: "#1a1a1a",
        color: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 20 }}>SoundLab — 音效試聽頁</h1>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        僅供開發測試使用，不會接到正式遊戲畫面。preload 狀態：
        {preloadDone ? "完成（有替換檔就會優先播放）" : "載入中…"}
      </p>

      {!unlocked && (
        <button
          onClick={handleUnlock}
          style={{
            padding: "10px 16px",
            fontSize: 15,
            marginBottom: 16,
            background: "#e07a3f",
            color: "#1a1a1a",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          點我啟用音效（瀏覽器政策要求）
        </button>
      )}

      <section
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
          padding: 12,
          background: "#262626",
          borderRadius: 8,
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          音量
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
          />
          <span style={{ width: 32, textAlign: "right" }}>{Math.round(volume * 100)}</span>
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={muted}
            onChange={(e) => handleMutedChange(e.target.checked)}
          />
          靜音
        </label>

        <button onClick={handleBedToggle} style={{ padding: "6px 12px" }}>
          {bedOn ? "停止背景音樂 (countdownBed)" : "播放背景音樂 (countdownBed)"}
        </button>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={urgent} onChange={handleUrgentToggle} />
          urgent（最後 10 秒版）
        </label>

        <button onClick={handleStopAll} style={{ padding: "6px 12px" }}>
          停止全部聲音
        </button>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {SOUND_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => handlePlay(name)}
            style={{
              padding: "12px 8px",
              background: "#2f2f2f",
              color: "#f5f5f5",
              border: "1px solid #444",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {name}
          </button>
        ))}
      </section>
    </main>
  );
}
