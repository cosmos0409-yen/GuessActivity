/**
 * SoundManager — 現場投影用喇叭播放的音效管理器。
 *
 * 設計原則：
 * - 全部音效用 Web Audio API 即時合成，不下載任何外部素材、無版權問題。
 * - 若 `public/sfx/<name>.mp3` 存在，preloadOverrides() 抓得到就優先播放該檔案；
 *   抓不到（404 / 網路失敗）就自動退回合成音，永遠有聲音可用。
 * - 投影場地喇叭低音弱，所有合成音的主要頻率都刻意落在中頻（約 200Hz~1.8kHz），
 *   避免使用需要喇叭低音才能聽到的次頻段。
 * - 瀏覽器的自動播放政策要求 AudioContext 必須在使用者手勢（點擊）之後才建立/恢復，
 *   因此 unlock() 必須在點擊事件的處理函式裡呼叫一次。
 * - 在 unlock() 之前呼叫 play()／startBed() 等一律安全地不做事、不丟錯。
 */

export type SoundName =
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

/** 全部 15 個事件名稱，用於 preload 與測試巡覽。 */
export const SOUND_NAMES: readonly SoundName[] = [
  "intro",
  "pickCategory",
  "questionShow",
  "tick",
  "tickUrgent",
  "countdownBed",
  "lifeline",
  "lock",
  "suspense",
  "correct",
  "wrong",
  "explanation",
  "levelUp",
  "champion",
  "timeUp",
];

const VOLUME_KEY = "quiz.sound.volume";
const MUTED_KEY = "quiz.sound.muted";
const DEFAULT_VOLUME = 0.8;

type AnyOscillatorType = OscillatorType;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function readStoredVolume(): number {
  try {
    const raw = (globalThis as any).localStorage?.getItem(VOLUME_KEY);
    if (raw != null) {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) return clamp01(parsed);
    }
  } catch {
    /* localStorage 被擋時忽略，用預設值 */
  }
  return DEFAULT_VOLUME;
}

function readStoredMuted(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem(MUTED_KEY);
    if (raw != null) return raw === "true";
  } catch {
    /* 忽略 */
  }
  return false;
}

function writeStorage(key: string, value: string): void {
  try {
    (globalThis as any).localStorage?.setItem(key, value);
  } catch {
    /* 有些環境（無痕模式、隱私設定）會擋 localStorage，忽略即可 */
  }
}

interface ReadyContext {
  ctx: AudioContext;
  master: GainNode;
}

/** 一個排定好的合成音符描述，方便用陣列組出一整段旋律。 */
interface ToneSpec {
  freqs: number[];
  type: AnyOscillatorType;
  start: number; // 相對現在時間的秒數
  duration: number;
  peak?: number;
  attack?: number;
  release?: number;
  slideTo?: number; // 若有值，freqs[0] 會滑音到這個頻率
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private volume: number;
  private muted: boolean;

  private overrides: Map<SoundName, AudioBuffer> = new Map();
  private activeSources: Set<AudioScheduledSourceNode> = new Set();

  private bedRunning = false;
  private bedUrgent = false;
  private bedTimerId: ReturnType<typeof setTimeout> | null = null;
  private bedSources: AudioScheduledSourceNode[] = [];

  constructor() {
    this.volume = readStoredVolume();
    this.muted = readStoredMuted();
  }

  /** 必須在使用者點擊等手勢事件中呼叫，才能建立/恢復 AudioContext。 */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (!this.master || !this.compressor) {
      const compressor = this.ctx.createDynamicsCompressor();
      const master = this.ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.master = master;
      this.compressor = compressor;
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume?.();
    }
  }

  private ready(): ReadyContext | null {
    if (!this.ctx || !this.master) return null;
    return { ctx: this.ctx, master: this.master };
  }

  /** 播放一個事件。未 unlock 時安全地不做事；合成或播放失敗一律吞掉，絕不丟錯。 */
  play(name: SoundName): void {
    const r = this.ready();
    if (!r) return;
    try {
      const override = this.overrides.get(name);
      if (override) {
        this.playBuffer(r, override);
      } else {
        this.playSynth(r, name);
      }
    } catch {
      /* 播放本身不該讓呼叫端出錯 */
    }
  }

  private trackSource(node: AudioScheduledSourceNode): void {
    this.activeSources.add(node);
    node.onended = () => {
      this.activeSources.delete(node);
    };
  }

  private playBuffer(r: ReadyContext, buffer: AudioBuffer): void {
    const src = r.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(r.master);
    this.trackSource(src);
    src.start();
  }

  // ---------------------------------------------------------------------
  // 基礎合成工具：都刻意避開低頻，主要落在中頻。
  // ---------------------------------------------------------------------

  /** 排一個音符：attack 快速拉升、release 前平坦、結尾快速拉到接近 0，避免爆音喀擦聲。 */
  private scheduleTone(r: ReadyContext, spec: ToneSpec): OscillatorNode[] {
    const { ctx, master } = r;
    const now = ctx.currentTime;
    const peak = spec.peak ?? 0.5;
    const attack = spec.attack ?? 0.012;
    const release = spec.release ?? 0.08;
    const startAt = now + spec.start;
    const stopAt = startAt + spec.duration;
    const nodes: OscillatorNode[] = [];
    const perVoicePeak = peak / Math.max(1, spec.freqs.length);

    for (const freq of spec.freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(freq, startAt);
      if (spec.slideTo != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.slideTo), stopAt);
      }
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(perVoicePeak, startAt + attack);
      const sustainUntil = Math.max(startAt + attack, stopAt - release);
      gain.gain.setValueAtTime(perVoicePeak, sustainUntil);
      gain.gain.linearRampToValueAtTime(0.0001, stopAt);

      osc.connect(gain);
      gain.connect(master);
      this.trackSource(osc);
      osc.start(startAt);
      osc.stop(stopAt + 0.02);
      nodes.push(osc);
    }
    return nodes;
  }

  private scheduleSequence(r: ReadyContext, specs: ToneSpec[]): void {
    for (const spec of specs) this.scheduleTone(r, spec);
  }

  /** 「紙張感」用的短促白噪音，音量很小、衰減很快，模擬翻紙的沙沙聲。 */
  private scheduleNoiseBurst(
    r: ReadyContext,
    start: number,
    duration: number,
    peak = 0.18,
  ): AudioBufferSourceNode {
    const { ctx, master } = r;
    const now = ctx.currentTime;
    const startAt = now + start;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // 隨機噪音乘上一個快速衰減的包絡，聽起來像紙張摩擦而不是持續的雜訊
      const envelope = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, startAt);
    gain.gain.linearRampToValueAtTime(0.0001, startAt + duration);
    src.connect(gain);
    gain.connect(master);
    this.trackSource(src);
    src.start(startAt);
    src.stop(startAt + duration + 0.02);
    return src;
  }

  // ---------------------------------------------------------------------
  // 15 個音效的合成定義
  // ---------------------------------------------------------------------

  private playSynth(r: ReadyContext, name: SoundName): void {
    switch (name) {
      case "intro":
        this.synthIntro(r);
        break;
      case "pickCategory":
        this.synthPickCategory(r);
        break;
      case "questionShow":
        this.synthQuestionShow(r);
        break;
      case "tick":
        this.synthTick(r);
        break;
      case "tickUrgent":
        this.synthTickUrgent(r);
        break;
      case "countdownBed":
        // countdownBed 是 loop 音效，透過 startBed()/stopBed() 控制，
        // 直接呼叫 play("countdownBed") 時播一次代表性的節拍聲即可。
        this.synthBedBeat(r, this.bedUrgent);
        break;
      case "lifeline":
        this.synthLifeline(r);
        break;
      case "lock":
        this.synthLock(r);
        break;
      case "suspense":
        this.synthSuspense(r);
        break;
      case "correct":
        this.synthCorrect(r);
        break;
      case "wrong":
        this.synthWrong(r);
        break;
      case "explanation":
        this.synthExplanation(r);
        break;
      case "levelUp":
        this.synthLevelUp(r);
        break;
      case "champion":
        this.synthChampion(r);
        break;
      case "timeUp":
        this.synthTimeUp(r);
        break;
      default:
        break;
    }
  }

  // intro：上行琶音（C5 E5 G5 C6）＋最後停在大三和弦，約 2.5 秒。
  private synthIntro(r: ReadyContext): void {
    const notes = [523.25, 659.25, 784.0, 1046.5];
    const specs: ToneSpec[] = notes.map((freq, i) => ({
      freqs: [freq],
      type: "triangle",
      start: i * 0.16,
      duration: 0.3,
      peak: 0.45,
      attack: 0.01,
      release: 0.15,
    }));
    specs.push({
      freqs: [523.25, 659.25, 784.0],
      type: "sine",
      start: notes.length * 0.16 + 0.05,
      duration: 1.7,
      peak: 0.5,
      attack: 0.08,
      release: 0.6,
    });
    this.scheduleSequence(r, specs);
  }

  // pickCategory：輕快的「叮」，三角波高音短促一聲。
  private synthPickCategory(r: ReadyContext): void {
    this.scheduleTone(r, {
      freqs: [1318.5],
      type: "triangle",
      start: 0,
      duration: 0.14,
      peak: 0.45,
      attack: 0.004,
      release: 0.08,
    });
  }

  // questionShow：兩音「登登」，先低後高，各約 140ms。
  private synthQuestionShow(r: ReadyContext): void {
    this.scheduleSequence(r, [
      { freqs: [523.25], type: "square", start: 0, duration: 0.14, peak: 0.4, release: 0.05 },
      { freqs: [659.25], type: "square", start: 0.17, duration: 0.18, peak: 0.45, release: 0.07 },
    ]);
  }

  // tick：倒數每秒的輕微滴答，1000Hz 方波，極短 15ms 包絡。
  private synthTick(r: ReadyContext): void {
    this.scheduleTone(r, {
      freqs: [1000],
      type: "square",
      start: 0,
      duration: 0.05,
      peak: 0.25,
      attack: 0.002,
      release: 0.03,
    });
  }

  // tickUrgent：最後 10 秒用，音高更高（1500Hz）、包絡更短更急促。
  private synthTickUrgent(r: ReadyContext): void {
    this.scheduleTone(r, {
      freqs: [1500],
      type: "square",
      start: 0,
      duration: 0.035,
      peak: 0.35,
      attack: 0.001,
      release: 0.02,
    });
  }

  // countdownBed 的一個節拍：正常版低鳴 260Hz，urgent 版較高更短促 340Hz。
  private synthBedBeat(r: ReadyContext, urgent: boolean): OscillatorNode[] {
    return this.scheduleTone(r, {
      freqs: urgent ? [340] : [260],
      type: "sine",
      start: 0,
      duration: urgent ? 0.1 : 0.16,
      peak: 0.28,
      attack: 0.004,
      release: 0.05,
    });
  }

  // lifeline：魔法感的上滑音，300Hz 滑到 1400Hz，約 450ms，尾巴加一點高音閃光。
  private synthLifeline(r: ReadyContext): void {
    this.scheduleTone(r, {
      freqs: [300],
      type: "sine",
      start: 0,
      duration: 0.42,
      peak: 0.4,
      attack: 0.02,
      release: 0.18,
      slideTo: 1400,
    });
    this.scheduleTone(r, {
      freqs: [1760],
      type: "triangle",
      start: 0.36,
      duration: 0.16,
      peak: 0.3,
      attack: 0.005,
      release: 0.1,
    });
  }

  // lock：鎖定答案，厚實一聲（兩個頻率疊在一起：鋸齒 220Hz + 正弦 440Hz），短而扎實。
  private synthLock(r: ReadyContext): void {
    this.scheduleTone(r, {
      freqs: [220, 440],
      type: "sawtooth",
      start: 0,
      duration: 0.18,
      peak: 0.45,
      attack: 0.003,
      release: 0.1,
    });
  }

  // suspense：揭曉前的懸疑感，鼓滾式的重複短促音，音量與速度逐漸增加，約 2.2 秒。
  private synthSuspense(r: ReadyContext): void {
    const totalDuration = 2.2;
    let t = 0;
    let i = 0;
    while (t < totalDuration) {
      const progress = t / totalDuration;
      const peak = 0.12 + progress * 0.38; // 漸強
      this.scheduleTone(r, {
        freqs: [420],
        type: "triangle",
        start: t,
        duration: 0.06,
        peak,
        attack: 0.003,
        release: 0.03,
      });
      i++;
      // 節奏漸快：一開始每 140ms 一次，最後加速到約 60ms 一次
      const interval = 0.14 - progress * 0.08;
      t += Math.max(0.06, interval);
    }
  }

  // correct：答對，明亮大三和弦（C E G）＋兩個高音閃爍音疊在尾段。
  private synthCorrect(r: ReadyContext): void {
    this.scheduleTone(r, {
      freqs: [523.25, 659.25, 784.0],
      type: "triangle",
      start: 0,
      duration: 0.55,
      peak: 0.55,
      attack: 0.01,
      release: 0.3,
    });
    this.scheduleSequence(r, [
      { freqs: [1567.98], type: "sine", start: 0.1, duration: 0.12, peak: 0.25, release: 0.08 },
      { freqs: [2093.0], type: "sine", start: 0.22, duration: 0.12, peak: 0.2, release: 0.08 },
    ]);
  }

  // wrong：答錯，下行「嗚嗚」兩聲，用滑音模擬卡通式的洩氣聲，好笑不恐怖。
  private synthWrong(r: ReadyContext): void {
    this.scheduleTone(r, {
      freqs: [400],
      type: "sawtooth",
      start: 0,
      duration: 0.26,
      peak: 0.38,
      attack: 0.01,
      release: 0.1,
      slideTo: 180,
    });
    this.scheduleTone(r, {
      freqs: [360],
      type: "sawtooth",
      start: 0.3,
      duration: 0.3,
      peak: 0.34,
      attack: 0.01,
      release: 0.12,
      slideTo: 140,
    });
  }

  // explanation：翻開詳解卡，紙張感的輕柔白噪音短爆，音量很小。
  private synthExplanation(r: ReadyContext): void {
    this.scheduleNoiseBurst(r, 0, 0.22, 0.16);
    this.scheduleTone(r, {
      freqs: [900],
      type: "sine",
      start: 0.02,
      duration: 0.12,
      peak: 0.12,
      attack: 0.01,
      release: 0.08,
    });
  }

  // levelUp：過關，短號角式的三音上行（G5 C6 E6）。
  private synthLevelUp(r: ReadyContext): void {
    this.scheduleSequence(r, [
      { freqs: [784.0], type: "square", start: 0, duration: 0.12, peak: 0.4, release: 0.05 },
      { freqs: [1046.5], type: "square", start: 0.1, duration: 0.12, peak: 0.42, release: 0.05 },
      { freqs: [1318.5], type: "square", start: 0.2, duration: 0.28, peak: 0.48, release: 0.15 },
    ]);
  }

  // champion：全破慶祝樂句，約 4 秒：快速上行音階 + 停留大和弦 + 結尾高音收束。
  private synthChampion(r: ReadyContext): void {
    const run = [523.25, 587.33, 659.25, 784.0, 880.0, 1046.5];
    const specs: ToneSpec[] = run.map((freq, i) => ({
      freqs: [freq],
      type: "triangle",
      start: i * 0.11,
      duration: 0.2,
      peak: 0.4,
      attack: 0.005,
      release: 0.1,
    }));
    const chordStart = run.length * 0.11 + 0.05;
    specs.push({
      freqs: [523.25, 659.25, 784.0, 1046.5],
      type: "sine",
      start: chordStart,
      duration: 2.0,
      peak: 0.5,
      attack: 0.05,
      release: 0.8,
    });
    specs.push({
      freqs: [1568.0],
      type: "triangle",
      start: chordStart + 2.1,
      duration: 1.0,
      peak: 0.4,
      attack: 0.01,
      release: 0.6,
    });
    this.scheduleSequence(r, specs);
  }

  // timeUp：時間到的蜂鳴，兩個中頻在 400/500Hz 間快速交替，模擬嗶嗶警示聲，約 0.7 秒。
  private synthTimeUp(r: ReadyContext): void {
    const totalDuration = 0.7;
    const step = 0.12;
    let t = 0;
    let high = false;
    while (t < totalDuration) {
      this.scheduleTone(r, {
        freqs: [high ? 500 : 400],
        type: "square",
        start: t,
        duration: step * 0.85,
        peak: 0.4,
        attack: 0.005,
        release: 0.03,
      });
      high = !high;
      t += step;
    }
  }

  // ---------------------------------------------------------------------
  // countdownBed：loop 播放的倒數背景音
  // ---------------------------------------------------------------------

  startBed(): void {
    const r = this.ready();
    if (!r) return;
    if (this.bedRunning) return; // 已經在跑，避免疊加兩層
    this.bedRunning = true;

    const beat = (): void => {
      if (!this.bedRunning) return;
      const ready = this.ready();
      if (!ready) {
        this.bedRunning = false;
        return;
      }
      const urgent = this.bedUrgent;
      const nodes = this.synthBedBeat(ready, urgent);
      this.bedSources.push(...nodes);
      // 已結束的節點清掉，避免陣列無限增長
      this.bedSources = this.bedSources.filter((n) => this.activeSources.has(n));
      const intervalMs = urgent ? 350 : 600;
      this.bedTimerId = setTimeout(beat, intervalMs);
    };
    beat();
  }

  stopBed(): void {
    this.bedRunning = false;
    if (this.bedTimerId != null) {
      clearTimeout(this.bedTimerId);
      this.bedTimerId = null;
    }
    for (const node of this.bedSources) {
      try {
        node.stop();
      } catch {
        /* 節點可能已經自然結束，忽略 */
      }
    }
    this.bedSources = [];
  }

  /** 切換 countdownBed 的 urgent 版本（速度加快），下一個節拍立即套用。 */
  setBedUrgent(urgent: boolean): void {
    this.bedUrgent = urgent;
  }

  /** 停止全部聲音，包含 loop 中的 bed 與尚未結束的 suspense/一次性音效。 */
  stopAll(): void {
    this.stopBed();
    for (const node of Array.from(this.activeSources)) {
      try {
        node.stop();
      } catch {
        /* 忽略已結束的節點 */
      }
    }
    this.activeSources.clear();
  }

  // ---------------------------------------------------------------------
  // 音量 / 靜音
  // ---------------------------------------------------------------------

  setVolume(value: number): void {
    this.volume = clamp01(value);
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : this.volume;
    }
    writeStorage(VOLUME_KEY, String(this.volume));
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : this.volume;
    }
    writeStorage(MUTED_KEY, String(this.muted));
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ---------------------------------------------------------------------
  // 音檔替換機制
  // ---------------------------------------------------------------------

  /**
   * 嘗試抓取 public/sfx/<name>.mp3（15 個名稱全部試一次）。
   * 抓到且成功 decode 的存進 overrides，之後 play() 會優先使用；
   * 404 或任何失敗都直接忽略，繼續使用合成音，不影響其他名稱的嘗試。
   */
  async preloadOverrides(): Promise<void> {
    // decode 需要 AudioContext，但不需要它已經被 resume（不需要使用者手勢）。
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    const ctx = this.ctx;

    await Promise.all(
      SOUND_NAMES.map(async (name) => {
        try {
          // BASE_URL 結尾一定帶 "/"（本機是 "/"，GitHub Pages 是 "/GuessActivity/"）
          const res = await fetch(`${import.meta.env.BASE_URL ?? "/"}sfx/${name}.mp3`);
          if (!res || !res.ok) return;
          const arrayBuffer = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          this.overrides.set(name, buffer);
        } catch {
          /* 抓不到或 decode 失敗都退回合成音 */
        }
      }),
    );
  }
}

export const soundManager = new SoundManager();
export default soundManager;
