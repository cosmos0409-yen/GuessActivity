import { describe, expect, it } from "vitest";
import { CountdownClock } from "./useCountdown";

/** 假時鐘：手動推進「現在時間」，讓 CountdownClock 的計算完全可預期、可重現。 */
function fakeClock(startAt = 0) {
  let current = startAt;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

describe("CountdownClock", () => {
  it("尚未 start() 時呼叫 tick() 不會改變 remaining", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 5000, now: t.now });
    t.advance(1000);
    clock.tick();
    expect(clock.remainingMs).toBe(5000);
    expect(clock.isRunning).toBe(false);
  });

  it("start() 後 tick() 依實際經過時間扣減 remaining", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 5000, now: t.now });
    clock.start();
    t.advance(1200);
    clock.tick();
    expect(clock.remainingMs).toBe(3800);
  });

  it("每次 tick 都會呼叫 onTick 並帶入目前剩餘毫秒數", () => {
    const t = fakeClock();
    const ticks: number[] = [];
    const clock = new CountdownClock({ totalMs: 3000, now: t.now, onTick: (r) => ticks.push(r) });
    clock.start();
    t.advance(1000);
    clock.tick();
    t.advance(1000);
    clock.tick();
    expect(ticks).toEqual([2000, 1000]);
  });

  it("即使 tick 呼叫間距不規則，也不會累積誤差（用實際經過時間，而非假設固定 interval）", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 10000, now: t.now });
    clock.start();
    const steps = [137, 82, 411, 55, 300, 999, 16];
    for (const step of steps) {
      t.advance(step);
      clock.tick();
    }
    const totalElapsed = steps.reduce((a, b) => a + b, 0);
    expect(clock.remainingMs).toBe(10000 - totalElapsed);
  });

  it("暫停期間經過的時間不會被扣掉；恢復後從暫停點繼續計算，誤差 < 100ms", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 30000, now: t.now });
    clock.start();
    t.advance(5000);
    clock.tick(); // remaining = 25000
    clock.pause();

    t.advance(9999); // 暫停期間，不應該影響 remaining
    expect(clock.remainingMs).toBe(25000);

    clock.resume();
    t.advance(5000);
    clock.tick(); // 實際運行時間共 5000+5000=10000ms

    expect(Math.abs(clock.remainingMs - 20000)).toBeLessThan(100);
  });

  it("尚未開始時呼叫 pause() 沒有效果", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 5000, now: t.now });
    clock.pause();
    expect(clock.remainingMs).toBe(5000);
    expect(clock.isRunning).toBe(false);
  });

  it("剩餘時間第一次 <= 10 秒時觸發一次 onFinal10，之後不會再觸發", () => {
    const t = fakeClock();
    let final10Count = 0;
    const clock = new CountdownClock({ totalMs: 30000, now: t.now, onFinal10: () => final10Count++ });
    clock.start();

    t.advance(15000); // remaining 15000，還沒到 10 秒
    clock.tick();
    expect(final10Count).toBe(0);

    t.advance(6000); // remaining 9000，觸發一次
    clock.tick();
    expect(final10Count).toBe(1);

    t.advance(1000); // remaining 8000，還是 <=10000 但不應再觸發
    clock.tick();
    expect(final10Count).toBe(1);
  });

  it("剩餘時間到 0 時觸發一次 onExpire，之後 tick 不會再觸發", () => {
    const t = fakeClock();
    let expireCount = 0;
    const clock = new CountdownClock({ totalMs: 1000, now: t.now, onExpire: () => expireCount++ });
    clock.start();

    t.advance(1500);
    clock.tick();
    expect(clock.remainingMs).toBe(0);
    expect(clock.isFinished).toBe(true);
    expect(expireCount).toBe(1);

    t.advance(500);
    clock.tick(); // 已結束，tick 沒有效果
    expect(expireCount).toBe(1);
    expect(clock.remainingMs).toBe(0);
  });

  it("stop() 永久結束：之後 start/resume/tick 都沒有效果，也不會再觸發 onExpire", () => {
    const t = fakeClock();
    let expireCount = 0;
    const clock = new CountdownClock({ totalMs: 5000, now: t.now, onExpire: () => expireCount++ });
    clock.start();
    t.advance(1000);
    clock.tick();
    const remainingBeforeStop = clock.remainingMs;

    clock.stop();
    expect(clock.isStopped).toBe(true);
    expect(clock.isRunning).toBe(false);

    clock.start();
    t.advance(10000);
    clock.tick();
    expect(clock.remainingMs).toBe(remainingBeforeStop);
    expect(expireCount).toBe(0);

    clock.resume();
    expect(clock.isRunning).toBe(false);
  });

  it("reset() 會回到初始總時長，並清除 finished/stopped 狀態", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 5000, now: t.now });
    clock.start();
    t.advance(6000);
    clock.tick();
    expect(clock.isFinished).toBe(true);

    clock.reset();
    expect(clock.remainingMs).toBe(5000);
    expect(clock.isFinished).toBe(false);
    expect(clock.isRunning).toBe(false);
  });

  it("reset(newTotalMs) 可以指定新的總時長（例如換題）", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 5000, now: t.now });
    clock.reset(20000);
    expect(clock.remainingMs).toBe(20000);
  });

  it("已經 running 時再呼叫 start() 沒有額外效果（不會重設起算點）", () => {
    const t = fakeClock();
    const clock = new CountdownClock({ totalMs: 5000, now: t.now });
    clock.start();
    t.advance(1000);
    clock.start(); // 應該是 no-op
    t.advance(1000);
    clock.tick();
    expect(clock.remainingMs).toBe(3000); // 總共經過 2000ms
  });
});
