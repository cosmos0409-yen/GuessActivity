import { describe, expect, it } from "vitest";
import { can, initialState, reducer } from "./gameMachine";
import type { GameState } from "./gameMachine";
import type { Question } from "../data/types";

function q(id: string, difficulty: number, overrides: Partial<Question> = {}): Question {
  return {
    id,
    categoryName: "測試題型",
    domain: "知識",
    difficulty,
    text: `題目 ${id}`,
    options: { A: "選項A", B: "選項B", C: "選項C", D: "選項D" },
    correct: "A",
    explanation: "詳解內容",
    status: "上架",
    ...overrides,
  };
}

/** 從 boot 開始，經 ENTER_LOBBY + NEW_GAME 到 pickCategory */
function setupNewGame(name = "測試員", config: Parameters<typeof initialState>[0] = {}): GameState {
  let s = initialState(config);
  s = reducer(s, { type: "ENTER_LOBBY" });
  s = reducer(s, { type: "NEW_GAME", contestantName: name });
  return s;
}

function setupToQuestionShown(question = q("Q1", 1)): GameState {
  let s = setupNewGame();
  s = reducer(s, { type: "PICK_CATEGORY", question });
  return s;
}

function setupToCounting(question = q("Q1", 1)): GameState {
  return reducer(setupToQuestionShown(question), { type: "START" });
}

/** 進到 answering 階段，但不消耗任何提示卡（用 host 時間到政策達成）*/
function setupToAnswering(question = q("Q1", 1)): GameState {
  let s = setupNewGame("測試員", { timeoutPolicy: "host" });
  s = reducer(s, { type: "PICK_CATEGORY", question });
  s = reducer(s, { type: "START" });
  s = reducer(s, { type: "TIMEOUT" });
  return s;
}

/** 走完一關：抽題 → 開始 → 選答 → 鎖定 → 揭曉 → 看詳解 → 下一步 */
function clearLevel(state: GameState, question: Question, answer: Question["correct"] | string): GameState {
  let s = reducer(state, { type: "PICK_CATEGORY", question });
  s = reducer(s, { type: "START" });
  s = reducer(s, { type: "SELECT", option: answer as never });
  s = reducer(s, { type: "LOCK" });
  s = reducer(s, { type: "REVEAL" });
  s = reducer(s, { type: "SHOW_EXPLANATION" });
  s = reducer(s, { type: "NEXT" });
  return s;
}

describe("initialState", () => {
  it("預設從 boot 開始，套用預設設定", () => {
    const s = initialState();
    expect(s.phase).toBe("boot");
    expect(s.config).toEqual({
      levels: 5,
      seconds: 30,
      safeLevel: 3,
      timeoutPolicy: "wrong",
      rehearsal: false,
      pollSeconds: 20,
    });
    expect(s.lifelines).toEqual({ fiftyRemove: true, phoneFriend: true, audiencePoll: true });
    expect(s.history).toEqual([]);
  });

  it("可以覆蓋部分設定", () => {
    const s = initialState({ levels: 3, timeoutPolicy: "host" });
    expect(s.config.levels).toBe(3);
    expect(s.config.timeoutPolicy).toBe("host");
    expect(s.config.seconds).toBe(30); // 其他仍是預設值
  });
});

describe("can() 抽樣檢查", () => {
  it("boot 階段只有 ENTER_LOBBY 合法", () => {
    const s = initialState();
    expect(can(s, "ENTER_LOBBY")).toBe(true);
    expect(can(s, "START")).toBe(false);
    expect(can(s, "NEW_GAME")).toBe(true); // NEW_GAME 允許在 boot 直接開新場
    expect(can(s, "PICK_CATEGORY")).toBe(false);
  });

  it("lobby 階段只有 NEW_GAME 合法", () => {
    const s = reducer(initialState(), { type: "ENTER_LOBBY" });
    expect(can(s, "NEW_GAME")).toBe(true);
    expect(can(s, "PICK_CATEGORY")).toBe(false);
    expect(can(s, "UNDO")).toBe(true); // 有一步歷史(ENTER_LOBBY)可以復原
  });

  it("questionShown 階段可以 START 或用提示卡，不能 SELECT", () => {
    const s = setupToQuestionShown();
    expect(can(s, "START")).toBe(true);
    expect(can(s, "SELECT")).toBe(false);
    expect(can(s, "USE_FIFTY_REMOVE")).toBe(true);
  });

  it("answering 階段：LOCK 需要先選過答案", () => {
    const s = setupToAnswering();
    expect(can(s, "LOCK")).toBe(false);
    const selected = reducer(s, { type: "SELECT", option: "A" });
    expect(can(selected, "LOCK")).toBe(true);
  });

  it("levelCleared 階段可以 WALK_AWAY 或 CONTINUE", () => {
    let s = setupNewGame();
    s = clearLevel(s, q("L1", 1), "A");
    expect(s.phase).toBe("levelCleared");
    expect(can(s, "WALK_AWAY")).toBe(true);
    expect(can(s, "CONTINUE")).toBe(true);
    expect(can(s, "SELECT")).toBe(false);
  });
});

describe("不合法的 action", () => {
  it("回傳原 state（reference 相等），不會 throw", () => {
    const s = initialState();
    expect(() => reducer(s, { type: "REVEAL" })).not.toThrow();
    const result = reducer(s, { type: "REVEAL" });
    expect(result).toBe(s);
  });

  it("SELECT 在非 answering 階段是不合法的", () => {
    const s = setupToQuestionShown();
    const result = reducer(s, { type: "SELECT", option: "A" });
    expect(result).toBe(s);
  });
});

describe("完整流程", () => {
  it("全對可以走完 5 關成為 champion", () => {
    let s = setupNewGame("小明");
    for (let level = 1; level <= 5; level++) {
      s = clearLevel(s, q(`L${level}`, level), "A");
      if (level < 5) {
        expect(s.phase).toBe("levelCleared");
        s = reducer(s, { type: "CONTINUE" });
        expect(s.level).toBe(level + 1);
      }
    }
    expect(s.phase).toBe("champion");
    expect(s.clearedLevels).toBe(5);
    expect(s.records).toHaveLength(1);
    expect(s.records[0].result).toBe("champion");
    expect(s.records[0].levels).toHaveLength(5);
    expect(s.records[0].contestantName).toBe("小明");
  });

  it("答錯且已經過保底關 → gameOver 保底成就為 safeLevel", () => {
    let s = setupNewGame("A同學");
    s = clearLevel(s, q("L1", 1), "A");
    s = reducer(s, { type: "CONTINUE" });
    s = clearLevel(s, q("L2", 2), "A");
    s = reducer(s, { type: "CONTINUE" });
    s = clearLevel(s, q("L3", 3), "A"); // safeLevel = 3
    expect(s.safeLevelReached).toBe(true);
    s = reducer(s, { type: "CONTINUE" });
    s = clearLevel(s, q("L4", 4), "B"); // 正解是 A，這裡答錯
    expect(s.phase).toBe("gameOver");
    expect(s.records[0].rewardLevel).toBe(3);
  });

  it("答錯且沒過保底關 → gameOver 保底成就為 0", () => {
    let s = setupNewGame("B同學");
    s = clearLevel(s, q("L1", 1), "B"); // 正解 A，答錯
    expect(s.phase).toBe("gameOver");
    expect(s.safeLevelReached).toBe(false);
    expect(s.records[0].rewardLevel).toBe(0);
  });

  it("WALK_AWAY 保留目前已通過的關數", () => {
    let s = setupNewGame("C同學");
    s = clearLevel(s, q("L1", 1), "A");
    s = reducer(s, { type: "CONTINUE" });
    s = clearLevel(s, q("L2", 2), "A");
    expect(s.phase).toBe("levelCleared");
    s = reducer(s, { type: "WALK_AWAY" });
    expect(s.phase).toBe("walkedAway");
    expect(s.records[0].result).toBe("walkedAway");
    expect(s.records[0].rewardLevel).toBe(2);
  });

  it("自訂設定：levels=2、safeLevel=1 時第 2 關答對即 champion", () => {
    let s = setupNewGame("D同學", { levels: 2, safeLevel: 1 });
    s = clearLevel(s, q("C1", 1), "A");
    expect(s.safeLevelReached).toBe(true);
    s = reducer(s, { type: "CONTINUE" });
    s = clearLevel(s, q("C2", 2), "A");
    expect(s.phase).toBe("champion");
    expect(s.records[0].clearedLevels).toBe(2);
  });
});

describe("timeoutPolicy", () => {
  it("'wrong'：時間到直接判錯並進入揭曉", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "TIMEOUT" });
    expect(s.phase).toBe("revealed");
    expect(s.correct).toBe(false);
  });

  it("'host'：時間到交由主持人裁量，進入 answering 不計時", () => {
    let s = setupNewGame("E同學", { timeoutPolicy: "host" });
    s = reducer(s, { type: "PICK_CATEGORY", question: q("Q1", 1) });
    s = reducer(s, { type: "START" });
    s = reducer(s, { type: "TIMEOUT" });
    expect(s.phase).toBe("answering");
  });

  it("TIMEOUT 在非 counting 階段不合法", () => {
    const s = setupToQuestionShown();
    const result = reducer(s, { type: "TIMEOUT" });
    expect(result).toBe(s);
  });
});

describe("提示卡", () => {
  it("每張卡每場只能用一次", () => {
    let s = setupToQuestionShown();
    s = reducer(s, { type: "USE_FIFTY_REMOVE", option: "B" });
    expect(s.lifelines.fiftyRemove).toBe(false);
    expect(can(s, "USE_FIFTY_REMOVE")).toBe(false);

    const before = s;
    const after = reducer(s, { type: "USE_FIFTY_REMOVE", option: "C" });
    expect(after).toBe(before);
  });

  it("三張卡各自獨立計次（用掉一張不影響另外兩張）", () => {
    let s = setupToQuestionShown();
    s = reducer(s, { type: "USE_FIFTY_REMOVE", option: "B" });
    expect(s.lifelines.phoneFriend).toBe(true);
    expect(s.lifelines.audiencePoll).toBe(true);
    expect(can(s, "USE_PHONE_FRIEND")).toBe(true);
    expect(can(s, "USE_AUDIENCE_POLL")).toBe(true);
  });

  it("使用提示卡後，counting 中的 TIMEOUT 不再生效（倒數永久結束）", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "USE_PHONE_FRIEND" });
    expect(s.phase).toBe("lifeline");
    expect(can(s, "TIMEOUT")).toBe(false);

    const before = s;
    const after = reducer(s, { type: "TIMEOUT" });
    expect(after).toBe(before);
  });

  it("fiftyRemove：刪除的選項不會是正解，且刪除後回到 answering", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "USE_FIFTY_REMOVE", option: "B" });
    expect(s.phase).toBe("answering");
    expect(s.removedOption).toBe("B");
  });

  it("被刪除的選項不能被 SELECT", () => {
    let s = setupToAnswering();
    s = reducer(s, { type: "USE_FIFTY_REMOVE", option: "B" });
    const before = s;
    const after = reducer(s, { type: "SELECT", option: "B" });
    expect(after).toBe(before);
    // 其他選項仍可以選
    const ok = reducer(s, { type: "SELECT", option: "C" });
    expect(ok.selected).toBe("C");
  });

  it("phoneFriend：進入 lifeline(phone)，主持人按 END_LIFELINE 回到 answering", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "USE_PHONE_FRIEND" });
    expect(s.phase).toBe("lifeline");
    expect(s.lifelineSub).toBe("phone");
    s = reducer(s, { type: "END_LIFELINE" });
    expect(s.phase).toBe("answering");
    expect(s.lifelineSub).toBeUndefined();
  });

  it("audiencePoll：記錄收票開始時間，可設定投票結果，結束後保留結果", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "USE_AUDIENCE_POLL", now: 12345 });
    expect(s.phase).toBe("lifeline");
    expect(s.lifelineSub).toBe("poll");
    expect(s.pollStartedAt).toBe(12345);

    s = reducer(s, { type: "SET_POLL_RESULT", result: { A: 10, B: 40, C: 30, D: 20 } });
    expect(s.pollResult).toEqual({ A: 10, B: 40, C: 30, D: 20 });

    s = reducer(s, { type: "END_LIFELINE" });
    expect(s.phase).toBe("answering");
    expect(s.pollResult).toEqual({ A: 10, B: 40, C: 30, D: 20 });
  });

  it("揭曉後不能使用提示卡", () => {
    let s = setupToAnswering();
    s = reducer(s, { type: "SELECT", option: "A" });
    s = reducer(s, { type: "LOCK" });
    s = reducer(s, { type: "REVEAL" });
    expect(s.phase).toBe("revealed");

    const before = s;
    const afterPhone = reducer(s, { type: "USE_PHONE_FRIEND" });
    expect(afterPhone).toBe(before);
    const afterPoll = reducer(s, { type: "USE_AUDIENCE_POLL" });
    expect(afterPoll).toBe(before);
    const afterFifty = reducer(s, { type: "USE_FIFTY_REMOVE", option: "B" });
    expect(afterFifty).toBe(before);
  });
});

describe("作答流程", () => {
  it("鎖定前可以重新選擇答案", () => {
    let s = setupToAnswering();
    s = reducer(s, { type: "SELECT", option: "A" });
    expect(s.selected).toBe("A");
    s = reducer(s, { type: "SELECT", option: "B" });
    expect(s.selected).toBe("B");
  });

  it("鎖定後不能改答案", () => {
    let s = setupToAnswering();
    s = reducer(s, { type: "SELECT", option: "A" });
    s = reducer(s, { type: "LOCK" });
    expect(s.phase).toBe("locked");

    const before = s;
    const after = reducer(s, { type: "SELECT", option: "B" });
    expect(after).toBe(before);
  });

  it("REVEAL 依照選擇是否等於正解判定對錯", () => {
    let correctPath = setupToAnswering();
    correctPath = reducer(correctPath, { type: "SELECT", option: "A" });
    correctPath = reducer(correctPath, { type: "LOCK" });
    correctPath = reducer(correctPath, { type: "REVEAL" });
    expect(correctPath.correct).toBe(true);
    expect(correctPath.lastEvent).toBe("reveal-correct");

    let wrongPath = setupToAnswering();
    wrongPath = reducer(wrongPath, { type: "SELECT", option: "D" });
    wrongPath = reducer(wrongPath, { type: "LOCK" });
    wrongPath = reducer(wrongPath, { type: "REVEAL" });
    expect(wrongPath.correct).toBe(false);
    expect(wrongPath.lastEvent).toBe("reveal-wrong");
  });
});

describe("REPLACE_QUESTION", () => {
  it("揭曉前可以換題，倒數重設回 questionShown，新舊題目都標記已使用", () => {
    let s = setupToCounting(q("OLD1", 2));
    const newQuestion = q("NEW1", 2);
    s = reducer(s, { type: "REPLACE_QUESTION", question: newQuestion });
    expect(s.phase).toBe("questionShown");
    expect(s.question).toBe(newQuestion);
    expect(s.usedQuestionIds).toContain("OLD1");
    expect(s.usedQuestionIds).toContain("NEW1");
  });

  it("換題不會退還已使用的提示卡", () => {
    let s = setupToCounting(q("OLD2", 2));
    s = reducer(s, { type: "USE_FIFTY_REMOVE", option: "B" });
    s = reducer(s, { type: "REPLACE_QUESTION", question: q("NEW2", 2) });
    expect(s.lifelines.fiftyRemove).toBe(false);
  });

  it("揭曉後不能換題", () => {
    let s = setupToAnswering();
    s = reducer(s, { type: "SELECT", option: "A" });
    s = reducer(s, { type: "LOCK" });
    s = reducer(s, { type: "REVEAL" });
    const before = s;
    const after = reducer(s, { type: "REPLACE_QUESTION", question: q("NEW3", 1) });
    expect(after).toBe(before);
  });
});

describe("UNDO", () => {
  it("可以復原上一步", () => {
    let s = initialState();
    s = reducer(s, { type: "ENTER_LOBBY" });
    s = reducer(s, { type: "NEW_GAME", contestantName: "F" });
    expect(s.phase).toBe("pickCategory");
    s = reducer(s, { type: "UNDO" });
    expect(s.phase).toBe("lobby");
  });

  it("可以連續復原多步", () => {
    let s = setupToCounting();
    s = reducer(s, { type: "USE_PHONE_FRIEND" }); // -> lifeline
    s = reducer(s, { type: "END_LIFELINE" }); // -> answering
    s = reducer(s, { type: "UNDO" });
    expect(s.phase).toBe("lifeline");
    s = reducer(s, { type: "UNDO" });
    expect(s.phase).toBe("counting");
  });

  it("不能復原到 boot 之前", () => {
    const s = initialState();
    expect(can(s, "UNDO")).toBe(false);
    const result = reducer(s, { type: "UNDO" });
    expect(result).toBe(s);
  });
});

describe("彩排模式", () => {
  it("不會累積 usedQuestionIds，也不會產生排行榜紀錄", () => {
    let s = setupNewGame("彩排員", { rehearsal: true });
    s = reducer(s, { type: "PICK_CATEGORY", question: q("R1", 1) });
    expect(s.usedQuestionIds).toEqual([]);
    s = reducer(s, { type: "START" });
    s = reducer(s, { type: "SELECT", option: "B" }); // 答錯（正解 A）
    s = reducer(s, { type: "LOCK" });
    s = reducer(s, { type: "REVEAL" });
    s = reducer(s, { type: "SHOW_EXPLANATION" });
    s = reducer(s, { type: "NEXT" });
    expect(s.phase).toBe("gameOver");
    expect(s.records).toEqual([]);
  });

  it("彩排模式下換題也不會標記已使用", () => {
    let s = setupNewGame("彩排員2", { rehearsal: true });
    s = reducer(s, { type: "PICK_CATEGORY", question: q("R2", 1) });
    s = reducer(s, { type: "REPLACE_QUESTION", question: q("R3", 1) });
    expect(s.usedQuestionIds).toEqual([]);
  });
});
