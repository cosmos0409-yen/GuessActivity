// 遊戲狀態機：純函式 reducer + initialState + can()。不依賴 React。
//
// 階段（phase）流程：
//   boot → lobby → pickCategory → questionShown → counting
//     → [lifeline] → answering → locked → revealed → explanation
//     → levelCleared | gameOver | walkedAway | champion
//   結算三個階段（gameOver／walkedAway／champion）可以 BACK_TO_LOBBY 回到 lobby，
//   讓主持人重新輸入參賽者名字，再用 NEW_GAME 開新的一場（沒有保底關概念：
//   答錯一律帶走「答錯之前已經通過的關數」clearedLevels，只是不能再繼續挑戰）。
//
// 設計原則：
//   - reducer 對不合法的 action 一律回傳原 state（reference 相等），不 throw。
//   - can(state, actionType) 給 UI 判斷按鈕要不要啟用，只看 action 的 type，不看payload細節。
//   - 倒數本身（tick）不在這個檔案裡，由 useCountdown / CountdownClock 負責；
//     這裡只管「現在允不允許倒數／有沒有永久停止倒數」這種階段轉換。

import type { OptionKey, Question } from "../data/types";
import { normalizeCategoryName } from "../data/picker";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

export interface GameConfig {
  /** 關數，預設 5 */
  levels: number;
  /** 每題倒數秒數，預設 30 */
  seconds: number;
  /** 時間到的處理方式：'wrong' 直接判錯；'host' 交由主持人裁量（進入 answering 不計時）*/
  timeoutPolicy: "wrong" | "host";
  /** 彩排模式：不寫入已使用題目、不產生排行榜紀錄 */
  rehearsal: boolean;
  /** 全場協助預設收票秒數，預設 20（供 UI/投票流程使用，reducer 只是保存） */
  pollSeconds: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  levels: 5,
  seconds: 30,
  timeoutPolicy: "wrong",
  rehearsal: false,
  pollSeconds: 20,
};

// ---------------------------------------------------------------------------
// 階段與提示卡
// ---------------------------------------------------------------------------

export type Phase =
  | "boot"
  | "lobby"
  | "pickCategory"
  | "questionShown"
  | "counting"
  | "lifeline"
  | "answering"
  | "locked"
  | "revealed"
  | "explanation"
  | "levelCleared"
  | "gameOver"
  | "walkedAway"
  | "champion";

export type LifelineKey = "fiftyRemove" | "phoneFriend" | "audiencePoll";

export type LifelineSub = "phone" | "poll";

export interface PollResult {
  A: number;
  B: number;
  C: number;
  D: number;
}

// ---------------------------------------------------------------------------
// 紀錄
// ---------------------------------------------------------------------------

export interface GameRecordLevel {
  level: number;
  questionId: string;
  categoryName: string;
  selected?: OptionKey;
  correct: boolean;
  lifelinesUsed: LifelineKey[];
}

export type GameResult = "champion" | "gameOver" | "walkedAway";

export interface GameRecord {
  contestantName: string;
  levels: GameRecordLevel[];
  lifelinesUsed: LifelineKey[];
  result: GameResult;
  /**
   * 已通關的關數：champion 時等於 config.levels；walkedAway/gameOver 時是
   * 「答錯（或帶走）之前已經通過的關數」——沒有保底關概念，答錯一律帶走這個關數對應的獎勵。
   */
  clearedLevels: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface GameState {
  phase: Phase;
  config: GameConfig;

  contestantName?: string;
  /** 目前第幾關（1-based）；boot/lobby 時為 0 */
  level: number;

  question?: Question;
  selected?: OptionKey;
  removedOption?: OptionKey;
  locked: boolean;
  correct?: boolean;
  /** 倒數是否暫停中（只有 phase==='counting' 時有意義）*/
  paused: boolean;
  /**
   * 這一題目前的 revealed／explanation／gameOver 是不是因為「時間到、系統自動判錯」
   * （timeoutPolicy==='wrong' 時的 TIMEOUT）造成的；換題／下一關／新的一場都會重設成 false。
   * 用來讓結算畫面（ResultOverlay）標示答錯原因是「時間到」還是「答錯了」。
   */
  timedOut: boolean;

  /** 每張提示卡是否還「可用」（true = 尚未用過） */
  lifelines: Record<LifelineKey, boolean>;
  /** 目前這關已經用過的提示卡（供結算紀錄用，換題不清空）*/
  lifelinesUsedThisLevel: LifelineKey[];
  lifelineSub?: LifelineSub;
  pollResult?: PollResult;
  pollStartedAt?: number;

  /** 已經抽過（顯示過）的題目 id；彩排模式不累加 */
  usedQuestionIds: string[];
  /** 已完成關卡的作答紀錄（含本場目前為止的所有關）*/
  levelRecords: GameRecordLevel[];
  clearedLevels: number;
  /** 本場已經選過的題型名稱；同一題型每場只能選一次（見 PICK_CATEGORY） */
  pickedCategoriesThisGame: string[];

  /** 給 SoundManager 用的最近一次非計時事件 */
  lastEvent?: string;

  /** 本機（本次執行期間）累積的場次紀錄；彩排模式不累加 */
  records: GameRecord[];

  /** UNDO 用的快照堆疊，最多保留 20 筆。堆疊裡的項目自身 history 一律是空陣列。 */
  history: GameState[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GameAction =
  | { type: "ENTER_LOBBY" }
  | { type: "NEW_GAME"; contestantName: string }
  | { type: "PICK_CATEGORY"; question: Question; allowRepeatCategory?: boolean }
  | { type: "BACK_TO_LOBBY" }
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RESET" }
  | { type: "TIMEOUT" }
  | { type: "USE_FIFTY_REMOVE"; option: OptionKey }
  | { type: "USE_PHONE_FRIEND" }
  | { type: "USE_AUDIENCE_POLL"; now?: number }
  | { type: "SET_POLL_RESULT"; result: PollResult }
  | { type: "END_LIFELINE" }
  | { type: "SELECT"; option: OptionKey }
  | { type: "LOCK" }
  | { type: "REVEAL" }
  | { type: "SHOW_EXPLANATION" }
  | { type: "NEXT" }
  | { type: "WALK_AWAY" }
  | { type: "CONTINUE" }
  | { type: "REPLACE_QUESTION"; question: Question }
  | { type: "UNDO" };

const LIFELINE_KEYS: LifelineKey[] = ["fiftyRemove", "phoneFriend", "audiencePoll"];
const LIFELINE_USABLE_PHASES: Phase[] = ["questionShown", "counting", "answering"];
const REPLACE_QUESTION_PHASES: Phase[] = ["questionShown", "counting", "lifeline", "answering", "locked"];
const RESTART_GAME_PHASES: Phase[] = ["boot", "lobby", "gameOver", "champion", "walkedAway"];
/** 結算畫面（答錯出局／帶走獎勵／全破），可以按「開始新的一場」回到大廳重新輸入參賽者名字 */
const RESULT_PHASES: Phase[] = ["gameOver", "walkedAway", "champion"];

// ---------------------------------------------------------------------------
// initialState
// ---------------------------------------------------------------------------

export function initialState(config: Partial<GameConfig> = {}): GameState {
  return {
    phase: "boot",
    config: { ...DEFAULT_CONFIG, ...config },
    level: 0,
    locked: false,
    paused: false,
    timedOut: false,
    lifelines: { fiftyRemove: true, phoneFriend: true, audiencePoll: true },
    lifelinesUsedThisLevel: [],
    usedQuestionIds: [],
    levelRecords: [],
    clearedLevels: 0,
    pickedCategoriesThisGame: [],
    records: [],
    history: [],
  };
}

// ---------------------------------------------------------------------------
// can()
// ---------------------------------------------------------------------------

export function can(state: GameState, actionType: GameAction["type"]): boolean {
  const { phase } = state;
  switch (actionType) {
    case "ENTER_LOBBY":
      return phase === "boot";
    case "NEW_GAME":
      return RESTART_GAME_PHASES.includes(phase);
    case "PICK_CATEGORY":
      return phase === "pickCategory";
    case "BACK_TO_LOBBY":
      return RESULT_PHASES.includes(phase);
    case "START":
      return phase === "questionShown";
    case "PAUSE":
      return phase === "counting" && !state.paused;
    case "RESUME":
      return phase === "counting" && state.paused;
    case "RESET":
      return phase === "counting" || phase === "questionShown";
    case "TIMEOUT":
      return phase === "counting";
    case "USE_FIFTY_REMOVE":
      return LIFELINE_USABLE_PHASES.includes(phase) && state.lifelines.fiftyRemove;
    case "USE_PHONE_FRIEND":
      return LIFELINE_USABLE_PHASES.includes(phase) && state.lifelines.phoneFriend;
    case "USE_AUDIENCE_POLL":
      return LIFELINE_USABLE_PHASES.includes(phase) && state.lifelines.audiencePoll;
    case "SET_POLL_RESULT":
      return phase === "lifeline" && state.lifelineSub === "poll";
    case "END_LIFELINE":
      return phase === "lifeline";
    case "SELECT":
      return phase === "counting" || phase === "answering";
    case "LOCK":
      return (phase === "counting" || phase === "answering") && state.selected !== undefined;
    case "REVEAL":
      return phase === "locked";
    case "SHOW_EXPLANATION":
      return phase === "revealed";
    case "NEXT":
      return phase === "explanation";
    case "WALK_AWAY":
      return phase === "levelCleared";
    case "CONTINUE":
      return phase === "levelCleared";
    case "REPLACE_QUESTION":
      return REPLACE_QUESTION_PHASES.includes(phase);
    case "UNDO":
      return state.history.length > 0;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// reducer
// ---------------------------------------------------------------------------

export function reducer(state: GameState, action: GameAction): GameState {
  const next = transition(state, action);
  if (next === state) return state;
  // UNDO 已經在 transition() 裡把 history 設成「復原後剩下的堆疊」，
  // 不能再疊加一層 pushHistory，否則會把復原結果蓋掉。
  if (action.type === "UNDO") return next;
  return { ...next, history: pushHistory(state) };
}

function pushHistory(state: GameState): GameState[] {
  const snapshot: GameState = { ...state, history: [] };
  const updated = [...state.history, snapshot];
  if (updated.length > 20) updated.shift();
  return updated;
}

function transition(state: GameState, action: GameAction): GameState {
  if (action.type === "UNDO") {
    if (state.history.length === 0) return state;
    const previous = state.history[state.history.length - 1];
    const remaining = state.history.slice(0, -1);
    return { ...previous, history: remaining };
  }

  if (!can(state, action.type)) return state;

  switch (action.type) {
    case "ENTER_LOBBY":
      return { ...state, phase: "lobby" };

    case "NEW_GAME":
      return {
        ...state,
        phase: "pickCategory",
        config: state.config,
        contestantName: action.contestantName,
        level: 1,
        question: undefined,
        selected: undefined,
        removedOption: undefined,
        locked: false,
        paused: false,
        correct: undefined,
        timedOut: false,
        lifelines: { fiftyRemove: true, phoneFriend: true, audiencePoll: true },
        lifelinesUsedThisLevel: [],
        lifelineSub: undefined,
        pollResult: undefined,
        pollStartedAt: undefined,
        levelRecords: [],
        clearedLevels: 0,
        pickedCategoriesThisGame: [],
        lastEvent: "new-game",
      };

    case "BACK_TO_LOBBY":
      return { ...state, phase: "lobby" };

    case "PICK_CATEGORY": {
      const categoryName = action.question.categoryName;
      // 用 normalizeCategoryName() 比對（去除前後空白與變體選擇符），
      // 否則同一個題型只因為 emoji 呈現方式不同（例如「⚖️」有沒有 U+FE0F）
      // 就會被誤判成沒選過，或反過來一直被誤判成選過。
      const alreadyPicked = state.pickedCategoriesThisGame.some(
        (name) => normalizeCategoryName(name) === normalizeCategoryName(categoryName),
      );
      // 同一題型每場只能選一次；主持人可以在畫面上明確略過這個限制（allowRepeatCategory），
      // 例如某一關剩下的新題型都已經沒有題目可抽時。
      if (alreadyPicked && !action.allowRepeatCategory) return state;

      const usedQuestionIds = state.config.rehearsal
        ? state.usedQuestionIds
        : [...state.usedQuestionIds, action.question.id];
      const pickedCategoriesThisGame = alreadyPicked
        ? state.pickedCategoriesThisGame
        : [...state.pickedCategoriesThisGame, categoryName];
      return {
        ...state,
        phase: "questionShown",
        question: action.question,
        selected: undefined,
        removedOption: undefined,
        locked: false,
        paused: false,
        correct: undefined,
        timedOut: false,
        pollResult: undefined,
        lifelineSub: undefined,
        usedQuestionIds,
        pickedCategoriesThisGame,
        lastEvent: "question-shown",
      };
    }

    case "START":
      return { ...state, phase: "counting", paused: false, lastEvent: "countdown-start" };

    case "PAUSE":
      return { ...state, paused: true, lastEvent: "countdown-pause" };

    case "RESUME":
      return { ...state, paused: false, lastEvent: "countdown-resume" };

    case "RESET":
      return { ...state, paused: false, lastEvent: "countdown-reset" };

    case "TIMEOUT": {
      if (state.config.timeoutPolicy === "wrong") {
        return {
          ...state,
          phase: "revealed",
          correct: false,
          selected: state.selected,
          paused: false,
          timedOut: true,
          lastEvent: "reveal-wrong",
        };
      }
      // "host" 政策：時間到交由主持人裁量，進入 answering 不自動判錯，所以不算「時間到判錯」。
      return { ...state, phase: "answering", paused: false, lastEvent: "timeout-host" };
    }

    case "USE_FIFTY_REMOVE":
      return {
        ...state,
        phase: "answering",
        paused: false,
        removedOption: action.option,
        selected: state.selected === action.option ? undefined : state.selected,
        lifelines: { ...state.lifelines, fiftyRemove: false },
        lifelinesUsedThisLevel: [...state.lifelinesUsedThisLevel, "fiftyRemove"],
        lastEvent: "lifeline-used",
      };

    case "USE_PHONE_FRIEND":
      return {
        ...state,
        phase: "lifeline",
        paused: false,
        lifelineSub: "phone",
        lifelines: { ...state.lifelines, phoneFriend: false },
        lifelinesUsedThisLevel: [...state.lifelinesUsedThisLevel, "phoneFriend"],
        lastEvent: "lifeline-used",
      };

    case "USE_AUDIENCE_POLL":
      return {
        ...state,
        phase: "lifeline",
        paused: false,
        lifelineSub: "poll",
        pollStartedAt: action.now ?? Date.now(),
        pollResult: undefined,
        lifelines: { ...state.lifelines, audiencePoll: false },
        lifelinesUsedThisLevel: [...state.lifelinesUsedThisLevel, "audiencePoll"],
        lastEvent: "lifeline-used",
      };

    case "SET_POLL_RESULT":
      return { ...state, pollResult: action.result, lastEvent: "poll-result-set" };

    case "END_LIFELINE":
      return { ...state, phase: "answering", lifelineSub: undefined, lastEvent: "lifeline-ended" };

    case "SELECT": {
      if (action.option === state.removedOption) return state;
      return { ...state, selected: action.option };
    }

    case "LOCK":
      return { ...state, phase: "locked", locked: true, lastEvent: "answer-locked" };

    case "REVEAL": {
      const correct = state.selected !== undefined && state.selected === state.question?.correct;
      return { ...state, phase: "revealed", correct, lastEvent: correct ? "reveal-correct" : "reveal-wrong" };
    }

    case "SHOW_EXPLANATION":
      return { ...state, phase: "explanation", lastEvent: "explanation-shown" };

    case "NEXT": {
      const levelRecord: GameRecordLevel = {
        level: state.level,
        questionId: state.question?.id ?? "",
        categoryName: state.question?.categoryName ?? "",
        selected: state.selected,
        correct: Boolean(state.correct),
        lifelinesUsed: state.lifelinesUsedThisLevel,
      };
      const levelRecords = [...state.levelRecords, levelRecord];

      if (state.correct) {
        const clearedLevels = state.level;
        const isLastLevel = state.level >= state.config.levels;

        if (isLastLevel) {
          const record = buildGameRecord(state, levelRecords, "champion");
          return {
            ...state,
            phase: "champion",
            levelRecords,
            clearedLevels,
            records: state.config.rehearsal ? state.records : [...state.records, record],
            lastEvent: "champion",
          };
        }

        return {
          ...state,
          phase: "levelCleared",
          levelRecords,
          clearedLevels,
          lastEvent: "level-cleared",
        };
      }

      // 答錯：沒有保底關概念，一律帶走「答錯之前已經通過的關數」（state.clearedLevels）的獎勵，
      // 只是不能再繼續挑戰下一關。
      const record = buildGameRecord(state, levelRecords, "gameOver");
      return {
        ...state,
        phase: "gameOver",
        levelRecords,
        records: state.config.rehearsal ? state.records : [...state.records, record],
        lastEvent: "game-over",
      };
    }

    case "WALK_AWAY": {
      const record = buildGameRecord(state, state.levelRecords, "walkedAway");
      return {
        ...state,
        phase: "walkedAway",
        records: state.config.rehearsal ? state.records : [...state.records, record],
        lastEvent: "walked-away",
      };
    }

    case "CONTINUE":
      return {
        ...state,
        phase: "pickCategory",
        level: state.level + 1,
        question: undefined,
        selected: undefined,
        removedOption: undefined,
        locked: false,
        paused: false,
        correct: undefined,
        timedOut: false,
        pollResult: undefined,
        lifelineSub: undefined,
        lifelinesUsedThisLevel: [],
        lastEvent: "next-level",
      };

    case "REPLACE_QUESTION": {
      const base: Partial<GameState> = {
        phase: "questionShown",
        question: action.question,
        selected: undefined,
        removedOption: undefined,
        locked: false,
        correct: undefined,
        timedOut: false,
        pollResult: undefined,
        lifelineSub: undefined,
        paused: false,
        lastEvent: "question-replaced",
      };
      if (state.config.rehearsal) {
        return { ...state, ...base };
      }
      const idsToAdd = [state.question?.id, action.question.id].filter(
        (id): id is string => Boolean(id),
      );
      const usedQuestionIds = Array.from(new Set([...state.usedQuestionIds, ...idsToAdd]));
      return { ...state, ...base, usedQuestionIds };
    }

    default:
      return state;
  }
}

function buildGameRecord(state: GameState, levelRecords: GameRecordLevel[], result: GameResult): GameRecord {
  const lifelinesUsed = LIFELINE_KEYS.filter((key) => !state.lifelines[key]);
  return {
    contestantName: state.contestantName ?? "",
    levels: levelRecords,
    lifelinesUsed,
    result,
    clearedLevels: result === "champion" ? state.config.levels : state.clearedLevels,
    timestamp: new Date().toISOString(),
  };
}
