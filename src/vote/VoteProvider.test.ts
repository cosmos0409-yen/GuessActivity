import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleFormVoteProvider, ManualVoteProvider, type VoteSnapshot } from "./VoteProvider";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

function collect(provider: { subscribe: (cb: (s: VoteSnapshot) => void) => () => void }) {
  const snapshots: VoteSnapshot[] = [];
  const unsubscribe = provider.subscribe((s) => snapshots.push(s));
  return { snapshots, unsubscribe };
}

describe("GoogleFormVoteProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("voteUrl 會把 {round} 換成 URL 編碼後的題號", () => {
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://docs.google.com/forms/d/e/xxx/viewform?entry.1={round}",
      statsUrl: "https://script.google.com/macros/s/yyy/exec",
    });
    const url = provider.voteUrl("場次1-關卡2-題3");
    expect(url).toBe(
      `https://docs.google.com/forms/d/e/xxx/viewform?entry.1=${encodeURIComponent("場次1-關卡2-題3")}`,
    );
  });

  it("依照 intervalMs 週期性呼叫 fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ counts: { A: 1, B: 0, C: 0, D: 0 }, total: 1 }),
    );
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      intervalMs: 1000,
      fetchImpl: fetchMock,
    });

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0); // 立刻執行的第一次 poll
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 每次呼叫都帶上正確的 round 參數
    const firstUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstUrl).toContain("round=round-1");

    provider.stop();
  });

  it("回應正確時計算出的 snapshot：counts、total、四捨五入後加總為 100 的百分比", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ counts: { A: 1, B: 1, C: 1, D: 0 }, total: 3 }),
    );
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      intervalMs: 2000,
      fetchImpl: fetchMock,
    });
    const { snapshots } = collect(provider);

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0);

    const last = snapshots[snapshots.length - 1];
    expect(last.status).toBe("live");
    expect(last.counts).toEqual({ A: 1, B: 1, C: 1, D: 0 });
    expect(last.total).toBe(3);
    const sum = last.percents.A + last.percents.B + last.percents.C + last.percents.D;
    expect(sum).toBe(100);
    // 1/3 各自四捨五入，其中一個會多拿 1% 讓總和是 100
    expect([last.percents.A, last.percents.B, last.percents.C].sort()).toEqual(
      [33, 33, 34].sort(),
    );
    expect(last.percents.D).toBe(0);

    provider.stop();
  });

  it("全部票數為 0 時，percents 全部是 0（不是平均分配 25/25/25/25）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0 }),
    );
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      fetchImpl: fetchMock,
    });
    const { snapshots } = collect(provider);

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0);

    const last = snapshots[snapshots.length - 1];
    expect(last.percents).toEqual({ A: 0, B: 0, C: 0, D: 0 });

    provider.stop();
  });

  it("連續 1-2 次失敗不會變成 error，第 3 次才會", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"));
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      intervalMs: 1000,
      fetchImpl: fetchMock,
    });
    const { snapshots } = collect(provider);

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0); // 失敗 1 次
    expect(snapshots[snapshots.length - 1].status).not.toBe("error");

    await vi.advanceTimersByTimeAsync(1000); // 失敗 2 次
    expect(snapshots[snapshots.length - 1].status).not.toBe("error");

    await vi.advanceTimersByTimeAsync(1000); // 失敗 3 次
    expect(snapshots[snapshots.length - 1].status).toBe("error");
    expect(snapshots[snapshots.length - 1].error).toBeTruthy();

    provider.stop();
  });

  it("進入 error 後恢復連線會回到 live", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(jsonResponse({ counts: { A: 2, B: 0, C: 0, D: 0 }, total: 2 }));
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      intervalMs: 1000,
      fetchImpl: fetchMock,
    });
    const { snapshots } = collect(provider);

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(snapshots[snapshots.length - 1].status).toBe("error");

    await vi.advanceTimersByTimeAsync(1000); // 這次成功
    expect(snapshots[snapshots.length - 1].status).toBe("live");
    expect(snapshots[snapshots.length - 1].counts.A).toBe(2);

    provider.stop();
  });

  it("回應是不合法的 JSON 時視為失敗", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      intervalMs: 1000,
      fetchImpl: fetchMock,
    });
    const { snapshots } = collect(provider);

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(snapshots[snapshots.length - 1].status).toBe("error");
  });

  it("回應 JSON 格式不符合預期結構時也視為失敗", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ foo: "bar" }));
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      intervalMs: 1000,
      fetchImpl: fetchMock,
    });
    const { snapshots } = collect(provider);

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(snapshots[snapshots.length - 1].status).toBe("error");
  });

  it("stop 後不會殘留 timer，不再呼叫 fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ counts: { A: 1, B: 0, C: 0, D: 0 }, total: 1 }),
    );
    const provider = new GoogleFormVoteProvider({
      formUrl: "https://example.com/form?e={round}",
      statsUrl: "https://example.com/stats",
      intervalMs: 1000,
      fetchImpl: fetchMock,
    });

    provider.start("round-1");
    await vi.advanceTimersByTimeAsync(0);
    const callsBeforeStop = fetchMock.mock.calls.length;

    provider.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock.mock.calls.length).toBe(callsBeforeStop);
  });
});

describe("ManualVoteProvider", () => {
  it("輸入的票數或百分比會被正規化成加總 100 的百分比", () => {
    const provider = new ManualVoteProvider();
    const { snapshots } = collect(provider);
    provider.start("round-1");

    provider.setPercents({ A: 40, B: 30, C: 20, D: 5 }); // 總和 95，需要正規化
    const last = snapshots[snapshots.length - 1];
    const sum = last.percents.A + last.percents.B + last.percents.C + last.percents.D;
    expect(sum).toBe(100);
    expect(last.status).toBe("manual");
  });

  it("輸入超過 100 的總和一樣會被正規化到 100", () => {
    const provider = new ManualVoteProvider();
    const { snapshots } = collect(provider);
    provider.start("round-1");

    provider.setPercents({ A: 80, B: 60, C: 40, D: 20 }); // 總和 200
    const last = snapshots[snapshots.length - 1];
    const sum = last.percents.A + last.percents.B + last.percents.C + last.percents.D;
    expect(sum).toBe(100);
  });

  it("輸入實際票數（非百分比）也能正確算出比例", () => {
    const provider = new ManualVoteProvider();
    const { snapshots } = collect(provider);
    provider.start("round-1");

    provider.setPercents({ A: 3, B: 1, C: 0, D: 0 });
    const last = snapshots[snapshots.length - 1];
    expect(last.total).toBe(4);
    expect(last.percents).toEqual({ A: 75, B: 25, C: 0, D: 0 });
  });

  it("全部為 0 時 percents 全為 0", () => {
    const provider = new ManualVoteProvider();
    const { snapshots } = collect(provider);
    provider.start("round-1");

    provider.setPercents({ A: 0, B: 0, C: 0, D: 0 });
    const last = snapshots[snapshots.length - 1];
    expect(last.percents).toEqual({ A: 0, B: 0, C: 0, D: 0 });
    expect(last.total).toBe(0);
  });
});
