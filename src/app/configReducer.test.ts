import { describe, expect, it } from "vitest";
import { appReducer } from "./configReducer";
import { initialState, type GameConfig } from "../state/gameMachine";

describe("appReducer —— SET_CONFIG 接到設定頁", () => {
  it("SET_CONFIG 會覆蓋 state.config，其他欄位不變", () => {
    const s0 = initialState();
    const newConfig: GameConfig = { ...s0.config, seconds: 45, safeLevel: 2, timeoutPolicy: "host", rehearsal: true };
    const s1 = appReducer(s0, { type: "SET_CONFIG", config: newConfig });
    expect(s1.config).toEqual(newConfig);
    expect(s1.phase).toBe(s0.phase);
    expect(s1.records).toBe(s0.records);
  });

  it("傳入同一個 config 參考時回傳原 state（reference 相等）", () => {
    const s0 = initialState();
    const s1 = appReducer(s0, { type: "SET_CONFIG", config: s0.config });
    expect(s1).toBe(s0);
  });

  it("其他 action 原封不動轉交給 gameMachine 的 reducer", () => {
    const s0 = initialState();
    const s1 = appReducer(s0, { type: "ENTER_LOBBY" });
    expect(s1.phase).toBe("lobby");
  });

  it("設成彩排模式之後，走一場流程不會累積 usedQuestionIds 或寫入排行榜（驗證真的接上 gameMachine 的 rehearsal 行為）", () => {
    let s = initialState();
    s = appReducer(s, { type: "SET_CONFIG", config: { ...s.config, rehearsal: true } });
    s = appReducer(s, { type: "ENTER_LOBBY" });
    s = appReducer(s, { type: "NEW_GAME", contestantName: "彩排員" });
    s = appReducer(s, {
      type: "PICK_CATEGORY",
      question: {
        id: "RQ1",
        categoryName: "測試題型",
        domain: "知識",
        difficulty: 1,
        text: "題目",
        options: { A: "A", B: "B", C: "C", D: "D" },
        correct: "A",
        explanation: "詳解",
        status: "上架",
      },
    });
    expect(s.usedQuestionIds).toEqual([]);
    s = appReducer(s, { type: "START" });
    s = appReducer(s, { type: "SELECT", option: "B" });
    s = appReducer(s, { type: "LOCK" });
    s = appReducer(s, { type: "REVEAL" });
    s = appReducer(s, { type: "SHOW_EXPLANATION" });
    s = appReducer(s, { type: "NEXT" });
    expect(s.phase).toBe("gameOver");
    expect(s.records).toEqual([]);
  });

  it("設定的每題秒數／保底關／時間到政策確實會反映在 state.config 上，供 App 讀取來驅動倒數與規則", () => {
    let s = initialState();
    s = appReducer(s, { type: "SET_CONFIG", config: { ...s.config, seconds: 45, safeLevel: 2, timeoutPolicy: "host" } });
    expect(s.config.seconds).toBe(45);
    expect(s.config.safeLevel).toBe(2);
    expect(s.config.timeoutPolicy).toBe("host");
  });
});
