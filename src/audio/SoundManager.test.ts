import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOUND_NAMES, SoundManager } from "./SoundManager";
import type { SoundName } from "./SoundManager";

/**
 * 最小的手寫 fake Web Audio API stub。
 * 不依賴任何 npm 套件，只實作 SoundManager.ts 實際會呼叫到的方法，
 * 並透過 FakeAudioContext 上的靜態陣列讓測試可以觀察「建立了哪些節點」「哪些節點被 stop() 過」。
 */
class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  linearRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
    return this;
  });
}

class FakeAudioNode {
  connect = vi.fn((_dest?: unknown) => this);
  disconnect = vi.fn();
}

class FakeOscillatorNode extends FakeAudioNode {
  type = "sine";
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeCompressorNode extends FakeAudioNode {}

class FakeAudioBuffer {
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {}
  getChannelData(_channel: number): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeAudioContext {
  static oscillators: FakeOscillatorNode[] = [];
  static gains: FakeGainNode[] = [];
  static bufferSources: FakeBufferSourceNode[] = [];

  static reset(): void {
    FakeAudioContext.oscillators = [];
    FakeAudioContext.gains = [];
    FakeAudioContext.bufferSources = [];
  }

  currentTime = 0;
  sampleRate = 44100;
  state: "running" | "suspended" = "running";
  destination = {};

  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    FakeAudioContext.oscillators.push(node);
    return node;
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    FakeAudioContext.gains.push(node);
    return node;
  }

  createBufferSource(): FakeBufferSourceNode {
    const node = new FakeBufferSourceNode();
    FakeAudioContext.bufferSources.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeCompressorNode {
    return new FakeCompressorNode();
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  decodeAudioData(_arrayBuffer: ArrayBuffer): Promise<FakeAudioBuffer> {
    return Promise.resolve(new FakeAudioBuffer(1, 1, 44100));
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
}

function createFakeStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
}

describe("SoundManager", () => {
  beforeEach(() => {
    FakeAudioContext.reset();
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    (globalThis as unknown as { localStorage: unknown }).localStorage = createFakeStorage();
  });

  afterEach(() => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { fetch?: unknown }).fetch;
    vi.restoreAllMocks();
  });

  it("還沒 unlock 時呼叫 play 不會丟錯，只是靜默", () => {
    const manager = new SoundManager();
    expect(() => manager.play("tick")).not.toThrow();
    // 沒有建立任何合成節點
    expect(FakeAudioContext.oscillators.length).toBe(0);
  });

  it("setMuted(true) 時 master gain 的值為 0", () => {
    const manager = new SoundManager();
    manager.unlock();
    const masterGain = FakeAudioContext.gains[0];
    expect(masterGain).toBeDefined();
    manager.setMuted(true);
    expect(masterGain.gain.value).toBe(0);
    expect(manager.isMuted()).toBe(true);
  });

  it("setVolume 會寫入 localStorage，且下一個 SoundManager 實例可以讀回", () => {
    const manager = new SoundManager();
    manager.setVolume(0.3);
    const another = new SoundManager();
    expect(another.getVolume()).toBeCloseTo(0.3, 5);
  });

  it("startBed 後呼叫 stopBed 會停止所有已排程的音源節點", () => {
    const manager = new SoundManager();
    manager.unlock();
    manager.startBed();
    expect(FakeAudioContext.oscillators.length).toBeGreaterThan(0);
    manager.stopBed();
    for (const osc of FakeAudioContext.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it("重複呼叫兩次 startBed 不會疊加兩層背景音", () => {
    const manager = new SoundManager();
    manager.unlock();
    manager.startBed();
    const countAfterFirst = FakeAudioContext.oscillators.length;
    expect(countAfterFirst).toBeGreaterThan(0);

    manager.startBed(); // 第二次呼叫應該是 no-op，不再多建立節點
    const countAfterSecond = FakeAudioContext.oscillators.length;
    expect(countAfterSecond).toBe(countAfterFirst);

    manager.stopBed();
  });

  it("有 override 時優先使用 AudioBuffer 播放；404 時退回合成音", async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/tick.mp3")) {
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    });

    const manager = new SoundManager();
    manager.unlock();
    await manager.preloadOverrides();

    FakeAudioContext.reset();
    manager.play("tick"); // 有 override
    expect(FakeAudioContext.bufferSources.length).toBe(1);
    expect(FakeAudioContext.oscillators.length).toBe(0);

    FakeAudioContext.reset();
    manager.play("lock"); // 404，沒有 override
    expect(FakeAudioContext.bufferSources.length).toBe(0);
    expect(FakeAudioContext.oscillators.length).toBeGreaterThan(0);
  });

  it("15 個事件名稱全部都能呼叫 play，而且不會丟錯", () => {
    expect(SOUND_NAMES.length).toBe(15);
    const manager = new SoundManager();
    manager.unlock();
    for (const name of SOUND_NAMES as readonly SoundName[]) {
      expect(() => manager.play(name)).not.toThrow();
    }
  });
});
