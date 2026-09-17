// ⚠️ 自動產生，請勿手改：來源是 src/audio/SoundManager.ts，重新產生請在 live-quiz/ 執行 node tools/build-sound.mjs
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../src/audio/SoundManager.ts
var SOUND_NAMES = [
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
  "timeUp"
];
var VOLUME_KEY = "quiz.sound.volume";
var MUTED_KEY = "quiz.sound.muted";
var DEFAULT_VOLUME = 0.8;
function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
function readStoredVolume() {
  try {
    const raw = globalThis.localStorage?.getItem(VOLUME_KEY);
    if (raw != null) {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) return clamp01(parsed);
    }
  } catch {
  }
  return DEFAULT_VOLUME;
}
function readStoredMuted() {
  try {
    const raw = globalThis.localStorage?.getItem(MUTED_KEY);
    if (raw != null) return raw === "true";
  } catch {
  }
  return false;
}
function writeStorage(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
  }
}
var SoundManager = class {
  constructor() {
    __publicField(this, "ctx", null);
    __publicField(this, "master", null);
    __publicField(this, "compressor", null);
    __publicField(this, "volume");
    __publicField(this, "muted");
    __publicField(this, "overrides", /* @__PURE__ */ new Map());
    __publicField(this, "activeSources", /* @__PURE__ */ new Set());
    __publicField(this, "bedRunning", false);
    __publicField(this, "bedUrgent", false);
    /** 背景音類型："countdown" 出題倒數節拍（決賽預設）；"lobby" 選拔賽等待室的輕柔琶音 */
    __publicField(this, "bedStyle", "countdown");
    __publicField(this, "bedStep", 0);
    __publicField(this, "bedTimerId", null);
    __publicField(this, "bedSources", []);
    this.volume = readStoredVolume();
    this.muted = readStoredMuted();
  }
  /** 必須在使用者點擊等手勢事件中呼叫，才能建立/恢復 AudioContext。 */
  unlock() {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
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
  ready() {
    if (!this.ctx || !this.master) return null;
    return { ctx: this.ctx, master: this.master };
  }
  /** 播放一個事件。未 unlock 時安全地不做事；合成或播放失敗一律吞掉，絕不丟錯。 */
  play(name) {
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
    }
  }
  trackSource(node) {
    this.activeSources.add(node);
    node.onended = () => {
      this.activeSources.delete(node);
    };
  }
  playBuffer(r, buffer) {
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
  scheduleTone(r, spec) {
    const { ctx, master } = r;
    const now = ctx.currentTime;
    const peak = spec.peak ?? 0.5;
    const attack = spec.attack ?? 0.012;
    const release = spec.release ?? 0.08;
    const startAt = now + spec.start;
    const stopAt = startAt + spec.duration;
    const nodes = [];
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
      gain.gain.linearRampToValueAtTime(1e-4, stopAt);
      osc.connect(gain);
      gain.connect(master);
      this.trackSource(osc);
      osc.start(startAt);
      osc.stop(stopAt + 0.02);
      nodes.push(osc);
    }
    return nodes;
  }
  scheduleSequence(r, specs) {
    for (const spec of specs) this.scheduleTone(r, spec);
  }
  /** 「紙張感」用的短促白噪音，音量很小、衰減很快，模擬翻紙的沙沙聲。 */
  scheduleNoiseBurst(r, start, duration, peak = 0.18) {
    const { ctx, master } = r;
    const now = ctx.currentTime;
    const startAt = now + start;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const envelope = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, startAt);
    gain.gain.linearRampToValueAtTime(1e-4, startAt + duration);
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
  playSynth(r, name) {
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
  synthIntro(r) {
    const notes = [523.25, 659.25, 784, 1046.5];
    const specs = notes.map((freq, i) => ({
      freqs: [freq],
      type: "triangle",
      start: i * 0.16,
      duration: 0.3,
      peak: 0.45,
      attack: 0.01,
      release: 0.15
    }));
    specs.push({
      freqs: [523.25, 659.25, 784],
      type: "sine",
      start: notes.length * 0.16 + 0.05,
      duration: 1.7,
      peak: 0.5,
      attack: 0.08,
      release: 0.6
    });
    this.scheduleSequence(r, specs);
  }
  // pickCategory：輕快的「叮」，三角波高音短促一聲。
  synthPickCategory(r) {
    this.scheduleTone(r, {
      freqs: [1318.5],
      type: "triangle",
      start: 0,
      duration: 0.14,
      peak: 0.45,
      attack: 4e-3,
      release: 0.08
    });
  }
  // questionShow：兩音「登登」，先低後高，各約 140ms。
  synthQuestionShow(r) {
    this.scheduleSequence(r, [
      { freqs: [523.25], type: "square", start: 0, duration: 0.14, peak: 0.4, release: 0.05 },
      { freqs: [659.25], type: "square", start: 0.17, duration: 0.18, peak: 0.45, release: 0.07 }
    ]);
  }
  // tick：倒數每秒的輕微滴答，1000Hz 方波，極短 15ms 包絡。
  synthTick(r) {
    this.scheduleTone(r, {
      freqs: [1e3],
      type: "square",
      start: 0,
      duration: 0.05,
      peak: 0.25,
      attack: 2e-3,
      release: 0.03
    });
  }
  // tickUrgent：最後 10 秒用，音高更高（1500Hz）、包絡更短更急促。
  synthTickUrgent(r) {
    this.scheduleTone(r, {
      freqs: [1500],
      type: "square",
      start: 0,
      duration: 0.035,
      peak: 0.35,
      attack: 1e-3,
      release: 0.02
    });
  }
  // countdownBed 的一個節拍：正常版低鳴 260Hz，urgent 版較高更短促 340Hz。
  // 等待室背景音：中頻的輕柔琶音，每 4 拍換一個和弦（C → Am → F → G），音量比倒數節拍小，
  // 投影場地喇叭低音弱，所以全部落在 260Hz 以上。
  synthLobbyBeat(r, step) {
    const chords = [
      [523.25, 659.25, 783.99, 659.25],
      [440, 523.25, 659.25, 523.25],
      [349.23, 440, 523.25, 440],
      [392, 493.88, 587.33, 493.88]
    ];
    const chord = chords[Math.floor(step / 4) % chords.length];
    const nodes = this.scheduleTone(r, {
      freqs: [chord[step % 4]],
      type: "triangle",
      start: 0,
      duration: 0.42,
      peak: 0.12,
      attack: 0.02,
      release: 0.3
    });
    if (step % 4 === 0) {
      nodes.push(
        ...this.scheduleTone(r, {
          freqs: [chord[0] / 2],
          type: "sine",
          start: 0,
          duration: 1.6,
          peak: 0.08,
          attack: 0.05,
          release: 0.8
        })
      );
    }
    return nodes;
  }
  synthBedBeat(r, urgent) {
    return this.scheduleTone(r, {
      freqs: urgent ? [340] : [260],
      type: "sine",
      start: 0,
      duration: urgent ? 0.1 : 0.16,
      peak: 0.28,
      attack: 4e-3,
      release: 0.05
    });
  }
  // lifeline：魔法感的上滑音，300Hz 滑到 1400Hz，約 450ms，尾巴加一點高音閃光。
  synthLifeline(r) {
    this.scheduleTone(r, {
      freqs: [300],
      type: "sine",
      start: 0,
      duration: 0.42,
      peak: 0.4,
      attack: 0.02,
      release: 0.18,
      slideTo: 1400
    });
    this.scheduleTone(r, {
      freqs: [1760],
      type: "triangle",
      start: 0.36,
      duration: 0.16,
      peak: 0.3,
      attack: 5e-3,
      release: 0.1
    });
  }
  // lock：鎖定答案，厚實一聲（兩個頻率疊在一起：鋸齒 220Hz + 正弦 440Hz），短而扎實。
  synthLock(r) {
    this.scheduleTone(r, {
      freqs: [220, 440],
      type: "sawtooth",
      start: 0,
      duration: 0.18,
      peak: 0.45,
      attack: 3e-3,
      release: 0.1
    });
  }
  // suspense：揭曉前的懸疑感，鼓滾式的重複短促音，音量與速度逐漸增加，約 2.2 秒。
  synthSuspense(r) {
    const totalDuration = 2.2;
    let t = 0;
    let i = 0;
    while (t < totalDuration) {
      const progress = t / totalDuration;
      const peak = 0.12 + progress * 0.38;
      this.scheduleTone(r, {
        freqs: [420],
        type: "triangle",
        start: t,
        duration: 0.06,
        peak,
        attack: 3e-3,
        release: 0.03
      });
      i++;
      const interval = 0.14 - progress * 0.08;
      t += Math.max(0.06, interval);
    }
  }
  // correct：答對，明亮大三和弦（C E G）＋兩個高音閃爍音疊在尾段。
  synthCorrect(r) {
    this.scheduleTone(r, {
      freqs: [523.25, 659.25, 784],
      type: "triangle",
      start: 0,
      duration: 0.55,
      peak: 0.55,
      attack: 0.01,
      release: 0.3
    });
    this.scheduleSequence(r, [
      { freqs: [1567.98], type: "sine", start: 0.1, duration: 0.12, peak: 0.25, release: 0.08 },
      { freqs: [2093], type: "sine", start: 0.22, duration: 0.12, peak: 0.2, release: 0.08 }
    ]);
  }
  // wrong：答錯，下行「嗚嗚」兩聲，用滑音模擬卡通式的洩氣聲，好笑不恐怖。
  synthWrong(r) {
    this.scheduleTone(r, {
      freqs: [400],
      type: "sawtooth",
      start: 0,
      duration: 0.26,
      peak: 0.38,
      attack: 0.01,
      release: 0.1,
      slideTo: 180
    });
    this.scheduleTone(r, {
      freqs: [360],
      type: "sawtooth",
      start: 0.3,
      duration: 0.3,
      peak: 0.34,
      attack: 0.01,
      release: 0.12,
      slideTo: 140
    });
  }
  // explanation：翻開詳解卡，紙張感的輕柔白噪音短爆，音量很小。
  synthExplanation(r) {
    this.scheduleNoiseBurst(r, 0, 0.22, 0.16);
    this.scheduleTone(r, {
      freqs: [900],
      type: "sine",
      start: 0.02,
      duration: 0.12,
      peak: 0.12,
      attack: 0.01,
      release: 0.08
    });
  }
  // levelUp：過關，短號角式的三音上行（G5 C6 E6）。
  synthLevelUp(r) {
    this.scheduleSequence(r, [
      { freqs: [784], type: "square", start: 0, duration: 0.12, peak: 0.4, release: 0.05 },
      { freqs: [1046.5], type: "square", start: 0.1, duration: 0.12, peak: 0.42, release: 0.05 },
      { freqs: [1318.5], type: "square", start: 0.2, duration: 0.28, peak: 0.48, release: 0.15 }
    ]);
  }
  // champion：全破慶祝樂句，約 4 秒：快速上行音階 + 停留大和弦 + 結尾高音收束。
  synthChampion(r) {
    const run = [523.25, 587.33, 659.25, 784, 880, 1046.5];
    const specs = run.map((freq, i) => ({
      freqs: [freq],
      type: "triangle",
      start: i * 0.11,
      duration: 0.2,
      peak: 0.4,
      attack: 5e-3,
      release: 0.1
    }));
    const chordStart = run.length * 0.11 + 0.05;
    specs.push({
      freqs: [523.25, 659.25, 784, 1046.5],
      type: "sine",
      start: chordStart,
      duration: 2,
      peak: 0.5,
      attack: 0.05,
      release: 0.8
    });
    specs.push({
      freqs: [1568],
      type: "triangle",
      start: chordStart + 2.1,
      duration: 1,
      peak: 0.4,
      attack: 0.01,
      release: 0.6
    });
    this.scheduleSequence(r, specs);
  }
  // timeUp：時間到的蜂鳴，兩個中頻在 400/500Hz 間快速交替，模擬嗶嗶警示聲，約 0.7 秒。
  synthTimeUp(r) {
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
        attack: 5e-3,
        release: 0.03
      });
      high = !high;
      t += step;
    }
  }
  // ---------------------------------------------------------------------
  // countdownBed：loop 播放的倒數背景音
  // ---------------------------------------------------------------------
  startBed(style = "countdown") {
    const r = this.ready();
    if (!r) return;
    if (this.bedRunning && this.bedStyle === style) return;
    if (this.bedRunning) this.stopBed();
    this.bedRunning = true;
    this.bedStyle = style;
    this.bedStep = 0;
    const beat = () => {
      if (!this.bedRunning) return;
      const ready = this.ready();
      if (!ready) {
        this.bedRunning = false;
        return;
      }
      const urgent = this.bedUrgent;
      const lobby = this.bedStyle === "lobby";
      const nodes = lobby ? this.synthLobbyBeat(ready, this.bedStep++) : this.synthBedBeat(ready, urgent);
      this.bedSources.push(...nodes);
      this.bedSources = this.bedSources.filter((n) => this.activeSources.has(n));
      const intervalMs = lobby ? 480 : urgent ? 350 : 600;
      this.bedTimerId = setTimeout(beat, intervalMs);
    };
    beat();
  }
  stopBed() {
    this.bedRunning = false;
    if (this.bedTimerId != null) {
      clearTimeout(this.bedTimerId);
      this.bedTimerId = null;
    }
    for (const node of this.bedSources) {
      try {
        node.stop();
      } catch {
      }
    }
    this.bedSources = [];
  }
  /** 切換 countdownBed 的 urgent 版本（速度加快），下一個節拍立即套用。 */
  setBedUrgent(urgent) {
    this.bedUrgent = urgent;
  }
  /** 停止全部聲音，包含 loop 中的 bed 與尚未結束的 suspense/一次性音效。 */
  stopAll() {
    this.stopBed();
    for (const node of Array.from(this.activeSources)) {
      try {
        node.stop();
      } catch {
      }
    }
    this.activeSources.clear();
  }
  // ---------------------------------------------------------------------
  // 音量 / 靜音
  // ---------------------------------------------------------------------
  setVolume(value) {
    this.volume = clamp01(value);
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : this.volume;
    }
    writeStorage(VOLUME_KEY, String(this.volume));
  }
  getVolume() {
    return this.volume;
  }
  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : this.volume;
    }
    writeStorage(MUTED_KEY, String(this.muted));
  }
  isMuted() {
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
  async preloadOverrides() {
    if (!this.ctx) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    const ctx = this.ctx;
    await Promise.all(
      SOUND_NAMES.map(async (name) => {
        try {
          const res = await fetch(`${"/"}sfx/${name}.mp3`);
          if (!res || !res.ok) return;
          const arrayBuffer = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          this.overrides.set(name, buffer);
        } catch {
        }
      })
    );
  }
};
var soundManager = new SoundManager();
var SoundManager_default = soundManager;
export {
  SOUND_NAMES,
  SoundManager,
  SoundManager_default as default,
  soundManager
};
