import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./styles/app.css";

import { loadQuestionBank, setRemoteUrls } from "./data/questionSource";
import { availability, normalizeCategoryName, stripLeadingEmoji } from "./data/picker";
import { getUsedIds, resetUsed } from "./data/usedStore";
import type { QuestionBank } from "./data/types";
import type { OptionKey } from "./data/types";

import { can, initialState } from "./state/gameMachine";
import { appReducer } from "./app/configReducer";
import { useCountdown } from "./hooks/useCountdown";
import { useHotkeys } from "./hooks/useHotkeys";

import { drawQuestionForRound, chooseRemovableOption, makeRoundId, makeSessionId } from "./app/gameFlow";
import { sfx } from "./app/soundBridge";
import soundManager from "./audio/SoundManager";
import { DEFAULT_RULE_SETTINGS, loadRuleSettings, saveRuleSettings, type RuleSettings } from "./app/settings";
import { appendRecord, clearRecords, loadRecords } from "./app/records";

import {
  GoogleFormVoteProvider,
  ManualVoteProvider,
  emptyCounts,
  computePercents,
  type VoteProvider,
  type VoteSnapshot,
} from "./vote/VoteProvider";
import { generateQrDataUrl } from "./vote/qr";
import { loadVoteSettings, saveVoteSettings, type VoteSettings } from "./vote/voteSettings";

import Stage from "./components/Stage";
import LevelLadder from "./components/LevelLadder";
import CategoryPicker from "./components/CategoryPicker";
import QuestionCard from "./components/QuestionCard";
import OptionGrid from "./components/OptionGrid";
import CountdownRing from "./components/CountdownRing";
import LifelineDock from "./components/LifelineDock";
import PhoneAFriend from "./components/PhoneAFriend";
import AudiencePoll, { PollChip } from "./components/AudiencePoll";
import { parseFinalists } from "./app/finalists";
import ExplanationCard from "./components/ExplanationCard";
import ResultOverlay from "./components/ResultOverlay";
import HostBar, { type HostBarAction } from "./components/HostBar";
import Lobby from "./components/Lobby";
import SettingsModal from "./components/SettingsModal";
import Leaderboard from "./components/Leaderboard";
import HotkeyHelpOverlay from "./components/HotkeyHelpOverlay";
import { assetUrl } from "./utils/baseUrl";

const EMBLEM_SRC = assetUrl("brand/emblem.jpg");
const TITLE_KEY = "quiz.settings.title";
const DEFAULT_TITLE = "司法官學院千元小學堂－決賽";
// 舊版的預設標題：瀏覽器裡存的如果還是它（主持人沒有自己改過），就換成新的預設標題
const LEGACY_DEFAULT_TITLE = "司法官學院 闖關大挑戰";

function loadTitle(): string {
  try {
    const saved = localStorage.getItem(TITLE_KEY);
    return saved && saved !== LEGACY_DEFAULT_TITLE ? saved : DEFAULT_TITLE;
  } catch {
    return DEFAULT_TITLE;
  }
}

function saveTitle(title: string): void {
  try {
    localStorage.setItem(TITLE_KEY, title);
  } catch {
    /* 忽略 */
  }
}

const idleSnapshot: VoteSnapshot = {
  counts: emptyCounts(),
  total: 0,
  percents: emptyCounts(),
  status: "idle",
  updatedAt: 0,
};

export default function App() {
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [pickCategoryError, setPickCategoryError] = useState<string | null>(null);
  const [timeUpNotice, setTimeUpNotice] = useState(false);
  const [voteSettings, setVoteSettings] = useState<VoteSettings>(() => loadVoteSettings());
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>(() => loadRuleSettings());
  const [title, setTitle] = useState(() => loadTitle());
  const [records, setRecords] = useState(() => loadRecords());
  // 選拔賽「前往決賽」帶過來的前 3 名（網址 ?c=名字&c=名字&c=名字）
  const [finalists] = useState(() => parseFinalists(window.location.search));

  const [state, dispatch] = useReducer(appReducer, undefined, () => initialState(ruleSettings));
  const sessionIdRef = useRef<string>(makeSessionId());

  // 每次 reducer 產生新的場次紀錄（gameOver/walkedAway/champion，非彩排模式）
  // 就同步寫進本機排行榜儲存；彩排模式下 state.records 本身就不會增加，天然不會寫入。
  const lastRecordsLengthRef = useRef(state.records.length);
  useEffect(() => {
    if (state.records.length > lastRecordsLengthRef.current) {
      const newOnes = state.records.slice(lastRecordsLengthRef.current);
      let updated = records;
      for (const record of newOnes) updated = appendRecord(record);
      setRecords(updated);
    }
    lastRecordsLengthRef.current = state.records.length;
  }, [state.records, records]);

  useEffect(() => {
    loadQuestionBank()
      .then(setBank)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  // 離開選題畫面（無論成功選到題目或直接跳關）就清掉上一次的錯誤提示，避免下一輪還殘留舊訊息。
  useEffect(() => {
    if (state.phase !== "pickCategory") setPickCategoryError(null);
  }, [state.phase]);

  // ---------------------------------------------------------------------
  // 主倒數（30 秒）
  // ---------------------------------------------------------------------
  const lastTickSecondRef = useRef<number | null>(null);

  const mainCountdown = useCountdown({
    seconds: state.config.seconds,
    onTick: (remainingMs) => {
      const sec = Math.ceil(remainingMs / 1000);
      if (lastTickSecondRef.current !== sec) {
        lastTickSecondRef.current = sec;
        sfx.play(remainingMs <= 10000 ? "tickUrgent" : "tick");
      }
    },
    onFinal10: () => {
      sfx.setBedUrgent(true);
    },
    onExpire: () => {
      sfx.stopBed();
      sfx.play("timeUp");
      dispatch({ type: "TIMEOUT" });
      // 時間到要先給主持人／觀眾看到明顯的提示，1.5 秒後再讓答案（revealed 畫面）露出來，
      // 不能倒數一結束就馬上無聲無息地跳去揭曉答案。
      setTimeUpNotice(true);
      window.setTimeout(() => setTimeUpNotice(false), 1500);
    },
  });

  // 換題／新題目時重設主倒數
  useEffect(() => {
    if (state.phase === "questionShown") {
      mainCountdown.reset(state.config.seconds);
      sfx.setBedUrgent(false);
      lastTickSecondRef.current = null;
      setTimeUpNotice(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.question?.id, state.phase === "questionShown"]);

  // ---------------------------------------------------------------------
  // 全場一起協助（投票）
  // ---------------------------------------------------------------------
  const providerRef = useRef<VoteProvider | null>(null);
  const [pollSnapshot, setPollSnapshot] = useState<VoteSnapshot>(idleSnapshot);
  const [pollManualMode, setPollManualMode] = useState(false);
  const [pollManualValues, setPollManualValues] = useState<Record<OptionKey, string>>({
    A: "0",
    B: "0",
    C: "0",
    D: "0",
  });
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>(undefined);
  // 投票彈窗是否收起（收起後在右側欄顯示小視窗，票照收）
  const [pollMinimized, setPollMinimized] = useState(false);
  const [pollErrorNotice, setPollErrorNotice] = useState(false);

  const pollCountdown = useCountdown({
    seconds: state.config.pollSeconds,
    onExpire: () => finishPoll(),
  });

  const stopProvider = useCallback(() => {
    providerRef.current?.stop();
    providerRef.current = null;
  }, []);

  const startManualProvider = useCallback((roundId: string) => {
    stopProvider();
    const manual = new ManualVoteProvider();
    providerRef.current = manual;
    manual.subscribe(setPollSnapshot);
    manual.start(roundId);
    setPollManualMode(true);
  }, [stopProvider]);

  const startOnlineProvider = useCallback(
    (roundId: string) => {
      stopProvider();
      const google = new GoogleFormVoteProvider({
        formUrl: voteSettings.formUrl,
        statsUrl: voteSettings.statsUrl,
        intervalMs: voteSettings.intervalMs,
      });
      providerRef.current = google;
      google.subscribe((snap) => {
        setPollSnapshot(snap);
        if (snap.status === "error") {
          setPollErrorNotice(true);
          startManualProvider(roundId);
        }
      });
      google.start(roundId);
      generateQrDataUrl(google.voteUrl(roundId))
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(undefined));
      setPollManualMode(false);
    },
    [voteSettings, stopProvider, startManualProvider],
  );

  // 進入 lifeline(poll) 時開始收票
  useEffect(() => {
    if (state.phase === "lifeline" && state.lifelineSub === "poll" && state.question) {
      const roundId = makeRoundId(sessionIdRef.current, state.level, state.question.id);
      setPollErrorNotice(false);
      setPollMinimized(false);
      setPollManualValues({ A: "0", B: "0", C: "0", D: "0" });
      pollCountdown.reset(state.config.pollSeconds);
      pollCountdown.start();
      if (voteSettings.enabled && voteSettings.formUrl && voteSettings.statsUrl) {
        startOnlineProvider(roundId);
      } else {
        setQrDataUrl(undefined);
        startManualProvider(roundId);
      }
    }
    if (!(state.phase === "lifeline" && state.lifelineSub === "poll")) {
      pollCountdown.stop();
      if (providerRef.current) stopProvider();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.lifelineSub, state.question?.id]);

  function finishPoll(): void {
    pollCountdown.stop();
    const result =
      pollManualMode && providerRef.current instanceof ManualVoteProvider
        ? pollSnapshot.percents
        : pollSnapshot.percents;
    stopProvider();
    dispatch({ type: "SET_POLL_RESULT", result });
    dispatch({ type: "END_LIFELINE" });
  }

  function handleManualChange(option: OptionKey, value: string): void {
    setPollManualValues((prev) => {
      const next = { ...prev, [option]: value };
      const counts = {
        A: Number(next.A) || 0,
        B: Number(next.B) || 0,
        C: Number(next.C) || 0,
        D: Number(next.D) || 0,
      };
      setPollSnapshot({
        counts,
        total: counts.A + counts.B + counts.C + counts.D,
        percents: computePercents(counts),
        status: "manual",
        updatedAt: Date.now(),
      });
      return next;
    });
  }

  function handleToggleManual(): void {
    if (!state.question) return;
    const roundId = makeRoundId(sessionIdRef.current, state.level, state.question.id);
    if (pollManualMode) {
      if (voteSettings.enabled && voteSettings.formUrl && voteSettings.statsUrl) {
        startOnlineProvider(roundId);
      }
    } else {
      startManualProvider(roundId);
    }
  }

  // ---------------------------------------------------------------------
  // 抽題 / 提示卡 / 主持人操作
  // ---------------------------------------------------------------------

  // 剩餘題數與可抽題判斷都要把「跨場次已使用題目」（localStorage）也算進去，
  // 否則主控台會顯示「剩餘 1 題」等錯誤數字，但實際 drawQuestionForRound 會排除掉
  // 已經用過的題目而回傳 null，導致點下去只有 focus 外框、沒有任何反應或提示。
  const usedIdsSet = useMemo(
    () => new Set([...state.usedQuestionIds, ...getUsedIds()]),
    [state.usedQuestionIds],
  );
  const availabilityMap = useMemo(() => (bank ? availability(bank, usedIdsSet) : {}), [bank, usedIdsSet]);
  const pickedCategoriesSet = useMemo(
    () => new Set(state.pickedCategoriesThisGame.map(normalizeCategoryName)),
    [state.pickedCategoriesThisGame],
  );

  const handleUnlockAndEnter = () => {
    sfx.unlock();
    sfx.play("intro");
    setBooted(true);
    dispatch({ type: "ENTER_LOBBY" });
  };

  const handleStartGame = (contestantName: string) => {
    sessionIdRef.current = makeSessionId();
    dispatch({ type: "NEW_GAME", contestantName });
  };

  const handlePickCategory = (categoryName: string, allowRepeatCategory: boolean) => {
    if (!bank) return;
    const question = drawQuestionForRound({
      bank,
      category: categoryName,
      difficulty: state.level,
      sessionUsedIds: state.usedQuestionIds,
      rehearsal: state.config.rehearsal,
    });
    if (question) {
      setPickCategoryError(null);
      sfx.play("pickCategory");
      dispatch({ type: "PICK_CATEGORY", question, allowRepeatCategory });
      sfx.play("questionShow");
    } else {
      // 靜默失敗會讓主持人以為按鈕壞了（畫面上只看得到 focus 外框）：
      // 這裡明確顯示原因，通常是「剩餘題數」的計算沒有把跨場次已用過的題目算進去。
      setPickCategoryError(`「${stripLeadingEmoji(categoryName)}」目前沒有可以抽的題目了，請選別的題型。`);
    }
  };

  const handleReplaceQuestion = () => {
    if (!bank || !state.question) return;
    const question = drawQuestionForRound({
      bank,
      category: state.question.categoryName,
      difficulty: state.level,
      sessionUsedIds: [...state.usedQuestionIds, state.question.id],
      rehearsal: state.config.rehearsal,
    });
    if (question) {
      dispatch({ type: "REPLACE_QUESTION", question });
      sfx.play("questionShow");
    }
  };

  const handleStart = () => {
    dispatch({ type: "START" });
    mainCountdown.start();
    sfx.startBed();
  };

  const handlePauseResume = () => {
    if (state.paused) {
      dispatch({ type: "RESUME" });
      mainCountdown.resume();
    } else {
      dispatch({ type: "PAUSE" });
      mainCountdown.pause();
    }
  };

  const handleUseFiftyRemove = () => {
    if (!state.question) return;
    const { option } = chooseRemovableOption(state.question);
    sfx.play("lifeline");
    mainCountdown.stop();
    sfx.stopBed();
    dispatch({ type: "USE_FIFTY_REMOVE", option });
  };

  const handleUsePhoneFriend = () => {
    sfx.play("lifeline");
    mainCountdown.stop();
    sfx.stopBed();
    dispatch({ type: "USE_PHONE_FRIEND" });
  };

  const handleUseAudiencePoll = () => {
    sfx.play("lifeline");
    mainCountdown.stop();
    sfx.stopBed();
    dispatch({ type: "USE_AUDIENCE_POLL", now: Date.now() });
  };

  const handleSelect = (option: OptionKey) => {
    dispatch({ type: "SELECT", option });
  };

  const handleLock = () => {
    sfx.play("lock");
    sfx.stopBed();
    mainCountdown.stop();
    dispatch({ type: "LOCK" });
    sfx.play("suspense");
  };

  const handleReveal = () => {
    const correct = state.selected !== undefined && state.selected === state.question?.correct;
    dispatch({ type: "REVEAL" });
    sfx.play(correct ? "correct" : "wrong");
  };

  const handleShowExplanation = () => {
    dispatch({ type: "SHOW_EXPLANATION" });
    sfx.play("explanation");
  };

  const handleNext = () => {
    const isLastLevel = state.level >= state.config.levels;
    const willClear = Boolean(state.correct);
    dispatch({ type: "NEXT" });
    if (willClear) sfx.play(isLastLevel ? "champion" : "levelUp");
  };

  const handleContinue = () => dispatch({ type: "CONTINUE" });
  const handleWalkAway = () => dispatch({ type: "WALK_AWAY" });
  const handleUndo = () => dispatch({ type: "UNDO" });
  // 從結算畫面（gameOver/walkedAway/champion）按「開始新的一場」：回到大廳（lobby），
  // 讓主持人可以重新輸入下一位參賽者的名字，再由 Lobby 的表單送出 NEW_GAME。
  // 上一場的紀錄在進到結算畫面的那一刻（NEXT/WALK_AWAY 的 reducer）已經寫進 state.records，
  // 不會因為回到大廳而遺失。
  const handleBackToLobby = () => dispatch({ type: "BACK_TO_LOBBY" });

  // 換題要先跳出確認（滑鼠點擊「換題」按鈕與 R 快捷鍵都走這裡），避免不小心點掉一題。
  const handleReplaceQuestionWithConfirm = () => {
    if (!can(state, "REPLACE_QUESTION")) return;
    if (window.confirm("確定要換一題嗎？目前這題會被放回題庫（不會標記為已使用）。")) {
      handleReplaceQuestion();
    }
  };

  const handleSaveSettings = (next: VoteSettings) => {
    saveVoteSettings(next);
    setVoteSettings(next);
  };

  const handleSaveTitle = (next: string) => {
    saveTitle(next);
    setTitle(next);
  };

  const handleSaveRuleSettings = (next: RuleSettings) => {
    saveRuleSettings(next);
    setRuleSettings(next);
    dispatch({ type: "SET_CONFIG", config: { ...state.config, ...next } });
  };

  const handleReloadQuestionBank = async (questionsUrl: string, categoriesUrl: string): Promise<QuestionBank> => {
    setRemoteUrls(questionsUrl, categoriesUrl);
    const next = await loadQuestionBank();
    setBank(next);
    return next;
  };

  const handleResetUsedQuestions = () => {
    resetUsed();
  };

  const handleClearRecords = () => {
    clearRecords();
    setRecords([]);
  };

  const handleOpenHostCards = () => {
    window.open(assetUrl("hostcards.html"), "_blank", "noopener");
  };

  const handleOpenLeaderboard = () => {
    setSettingsOpen(false);
    setLeaderboardOpen(true);
  };

  // ---------------------------------------------------------------------
  // 快捷鍵（Space 開始/暫停、1-4/A-D 選答、Enter 鎖定/揭曉、→/PageDown 下一步、
  // H/P/V 三張提示卡、R 換題、Ctrl+Z 復原、M 靜音、F 全螢幕、? 說明浮層）
  // 全部按鍵都經過 useHotkeys -> computeHotkeyAction() 用 can() 判斷是否允許。
  // ---------------------------------------------------------------------
  const [muted, setMuted] = useState(() => soundManager.isMuted());

  const handleToggleMute = useCallback(() => {
    const next = !soundManager.isMuted();
    soundManager.setMuted(next);
    setMuted(next);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  }, []);

  const handleToggleCountdownHotkey = useCallback(() => {
    if (can(state, "START")) {
      handleStart();
    } else if (state.paused && can(state, "RESUME")) {
      handlePauseResume();
    } else if (can(state, "PAUSE")) {
      handlePauseResume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleLockOrRevealHotkey = useCallback(() => {
    if (can(state, "LOCK")) {
      handleLock();
    } else if (can(state, "REVEAL")) {
      handleReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleNextHotkey = useCallback(() => {
    if (state.phase === "explanation") {
      handleNext();
    } else if (can(state, "SHOW_EXPLANATION")) {
      handleShowExplanation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const { helpOpen, closeHelp } = useHotkeys({
    state,
    enabled: booted && !settingsOpen && !leaderboardOpen,
    onToggleCountdown: handleToggleCountdownHotkey,
    onSelectOption: handleSelect,
    onLockOrReveal: handleLockOrRevealHotkey,
    onNext: handleNextHotkey,
    onFiftyRemove: handleUseFiftyRemove,
    onPhoneFriend: handleUsePhoneFriend,
    onAudiencePoll: handleUseAudiencePoll,
    onReplaceQuestion: handleReplaceQuestionWithConfirm,
    onUndo: handleUndo,
    onMute: handleToggleMute,
    onFullscreen: handleToggleFullscreen,
  });

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (loadError) {
    return (
      <main className="tpi-app" style={{ padding: 32, color: "var(--tpi-red)", background: "var(--tpi-cream)" }}>
        <h1 style={{ fontFamily: "var(--tpi-font-heading)" }}>題庫載入失敗</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!bank) {
    return (
      <main className="tpi-app tpi-boot">
        <p style={{ fontFamily: "var(--tpi-font-heading)", fontSize: 28 }}>題庫載入中…</p>
      </main>
    );
  }

  if (!booted || state.phase === "boot") {
    return (
      <main className="tpi-app tpi-boot">
        <img className="tpi-boot__emblem" src={EMBLEM_SRC} alt="司法官學院院徽" />
        <h1 className="tpi-boot__title">{title}</h1>
        <button type="button" className="tpi-boot__button" onClick={handleUnlockAndEnter}>
          開始
        </button>
      </main>
    );
  }

  if (state.phase === "lobby") {
    return (
      <main className="tpi-app">
        <Lobby
          emblemSrc={EMBLEM_SRC}
          title={title}
          onStart={handleStartGame}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
          finalists={finalists}
          playedNames={state.records.map((record) => record.contestantName)}
        />
        {settingsOpen && (
          <SettingsModal
            voteSettings={voteSettings}
            onSaveVoteSettings={handleSaveSettings}
            ruleSettings={ruleSettings}
            onSaveRuleSettings={handleSaveRuleSettings}
            title={title}
            onSaveTitle={handleSaveTitle}
            bank={bank}
            onReloadQuestionBank={handleReloadQuestionBank}
            onResetUsedQuestions={handleResetUsedQuestions}
            onOpenHostCards={handleOpenHostCards}
            onOpenLeaderboard={handleOpenLeaderboard}
            muted={muted}
            onMutedChange={setMuted}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {leaderboardOpen && (
          <Leaderboard records={records} onClearRecords={handleClearRecords} onClose={() => setLeaderboardOpen(false)} />
        )}
        {helpOpen && <HotkeyHelpOverlay onClose={closeHelp} />}
        {state.config.rehearsal && <div className="tpi-rehearsal-badge">彩排中</div>}
      </main>
    );
  }

  const hostActions: HostBarAction[] = [
    { label: "開始", onClick: handleStart, enabled: can(state, "START"), variant: "primary" },
    {
      label: state.paused ? "恢復" : "暫停",
      onClick: handlePauseResume,
      enabled: state.paused ? can(state, "RESUME") : can(state, "PAUSE"),
    },
    { label: "鎖定", onClick: handleLock, enabled: can(state, "LOCK") },
    { label: "揭曉", onClick: handleReveal, enabled: can(state, "REVEAL"), variant: "primary" },
    {
      label: "下一步",
      onClick: state.phase === "explanation" ? handleNext : handleShowExplanation,
      enabled: can(state, "SHOW_EXPLANATION") || can(state, "NEXT"),
      variant: "primary",
    },
    { label: "換題", onClick: handleReplaceQuestionWithConfirm, enabled: can(state, "REPLACE_QUESTION") },
    { label: "復原", onClick: handleUndo, enabled: can(state, "UNDO"), variant: "danger" },
  ];

  const showOptionGrid = Boolean(state.question) && state.phase !== "pickCategory";
  const showCountdown = ["questionShown", "counting", "lifeline", "answering", "locked"].includes(state.phase);
  const showLifelineDock = LIFELINE_PHASES.includes(state.phase);
  const isPhoneOverlay = state.phase === "lifeline" && state.lifelineSub === "phone";
  const isPollActive = state.phase === "lifeline" && state.lifelineSub === "poll";

  return (
    <main className="tpi-app">
      <Stage title={title} emblemSrc={EMBLEM_SRC} contestantName={state.contestantName}>
        <LevelLadder levels={state.config.levels} currentLevel={state.level} clearedLevels={state.clearedLevels} />

        {state.phase === "pickCategory" && (
          <>
            {pickCategoryError && <p className="tpi-poll__error">{pickCategoryError}</p>}
            <CategoryPicker
              categories={bank.categories}
              difficulty={state.level}
              availability={availabilityMap}
              pickedCategories={pickedCategoriesSet}
              onPick={(category, allowRepeat) => handlePickCategory(category.name, allowRepeat)}
            />
          </>
        )}

        {state.question && state.phase !== "pickCategory" && (
          // 題目 + 選項放左邊主欄，倒數與提示卡放右邊窄欄；用 CSS grid 讓兩欄各自佔滿高度，
          // 不會因為倒數圓環出現／消失而把選項擠到 HostBar 底下（見 2026-09-13 第二輪試玩問題 2）。
          <div className="tpi-play">
            <div className="tpi-play__main">
              <QuestionCard question={state.question} level={state.level} />
              {pollErrorNotice && !isPollActive && (
                <p className="tpi-poll__error">上一次線上投票連線異常，已自動切換為手動輸入。</p>
              )}
              {showOptionGrid && (
                <OptionGrid
                  question={state.question}
                  selected={state.selected}
                  removedOption={state.removedOption}
                  locked={state.locked}
                  revealed={state.phase === "revealed" || state.phase === "explanation"}
                  correct={state.correct}
                  selectable={state.phase === "counting" || state.phase === "answering"}
                  onSelect={handleSelect}
                  pollPercents={state.pollResult}
                />
              )}
            </div>
            <div className="tpi-play__side">
              {showCountdown && (
                <CountdownRing
                  remainingMs={mainCountdown.remainingMs}
                  totalMs={state.config.seconds * 1000}
                  // 「不計時」只在提示卡永久結束倒數之後才顯示（lifeline／answering／locked）；
                  // 題目剛出現、主持人還沒按「開始」的 questionShown 階段，要顯示完整秒數待命，
                  // 不能一出題就先顯示「不計時」（見 2026-09-13 第二輪試玩問題 3）。
                  stopped={!["questionShown", "counting"].includes(state.phase)}
                />
              )}
              {showLifelineDock && (
                <LifelineDock
                  available={state.lifelines}
                  usable={
                    can(state, "USE_FIFTY_REMOVE") || can(state, "USE_PHONE_FRIEND") || can(state, "USE_AUDIENCE_POLL")
                  }
                  onUseFiftyRemove={handleUseFiftyRemove}
                  onUsePhoneFriend={handleUsePhoneFriend}
                  onUseAudiencePoll={handleUseAudiencePoll}
                />
              )}
            </div>
          </div>
        )}
      </Stage>

      {isPhoneOverlay && <PhoneAFriend onEnd={() => dispatch({ type: "END_LIFELINE" })} />}

      {/* 全場一起協助：彈窗（不在題目欄裡插入面板，避免小螢幕把題目擠掉）；收起後改成右側欄的小視窗 */}
      {isPollActive && state.question && !pollMinimized && (
        <AudiencePoll
          qrDataUrl={qrDataUrl}
          snapshot={pollSnapshot}
          remainingSeconds={Math.ceil(pollCountdown.remainingMs / 1000)}
          onFinishEarly={finishPoll}
          manualMode={pollManualMode}
          onToggleManual={handleToggleManual}
          manualValues={pollManualValues}
          onManualChange={handleManualChange}
          questionText={state.question.text}
          optionTexts={state.question.options}
          removedOption={state.removedOption}
          onMinimize={() => setPollMinimized(true)}
        />
      )}
      {isPollActive && pollMinimized && (
        <PollChip
          remainingSeconds={Math.ceil(pollCountdown.remainingMs / 1000)}
          total={pollSnapshot.total}
          manualMode={pollManualMode}
          onExpand={() => setPollMinimized(false)}
          onFinishEarly={finishPoll}
        />
      )}

      {timeUpNotice && (
        <div className="tpi-timeup" role="alert">
          <span className="tpi-timeup__text">⏰ 時間到！</span>
        </div>
      )}

      {state.phase === "explanation" && state.question && <ExplanationCard question={state.question} />}

      {state.phase === "levelCleared" && (
        <ResultOverlay
          kind="levelCleared"
          level={state.level}
          clearedLevels={state.clearedLevels}
          onContinue={handleContinue}
          onWalkAway={handleWalkAway}
        />
      )}
      {state.phase === "gameOver" && (
        <ResultOverlay
          kind="gameOver"
          level={state.level}
          clearedLevels={state.clearedLevels}
          timedOut={state.timedOut}
          onNewGame={handleBackToLobby}
          onOpenLeaderboard={handleOpenLeaderboard}
        />
      )}
      {state.phase === "walkedAway" && (
        <ResultOverlay
          kind="walkedAway"
          level={state.level}
          clearedLevels={state.clearedLevels}
          onNewGame={handleBackToLobby}
          onOpenLeaderboard={handleOpenLeaderboard}
        />
      )}
      {state.phase === "champion" && (
        <ResultOverlay
          kind="champion"
          level={state.level}
          clearedLevels={state.clearedLevels}
          onNewGame={handleBackToLobby}
          onOpenLeaderboard={handleOpenLeaderboard}
        />
      )}

      {!["levelCleared", "gameOver", "walkedAway", "champion"].includes(state.phase) && (
        <HostBar actions={hostActions} />
      )}

      {muted && <div className="tpi-mute-badge" aria-label="已靜音">🔇</div>}

      {settingsOpen && (
        <SettingsModal
          voteSettings={voteSettings}
          onSaveVoteSettings={handleSaveSettings}
          ruleSettings={ruleSettings}
          onSaveRuleSettings={handleSaveRuleSettings}
          title={title}
          onSaveTitle={handleSaveTitle}
          bank={bank}
          onReloadQuestionBank={handleReloadQuestionBank}
          onResetUsedQuestions={handleResetUsedQuestions}
          onOpenHostCards={handleOpenHostCards}
          onOpenLeaderboard={handleOpenLeaderboard}
          muted={muted}
          onMutedChange={setMuted}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {leaderboardOpen && (
        <Leaderboard records={records} onClearRecords={handleClearRecords} onClose={() => setLeaderboardOpen(false)} />
      )}

      {helpOpen && <HotkeyHelpOverlay onClose={closeHelp} />}

      {state.config.rehearsal && <div className="tpi-rehearsal-badge">彩排中</div>}
    </main>
  );
}

const LIFELINE_PHASES = ["questionShown", "counting", "answering", "lifeline"];
