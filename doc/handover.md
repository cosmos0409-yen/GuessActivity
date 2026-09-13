# 交接手冊 — 司法官學院 闖關猜謎 App

> 最後更新：2026-09-13
> 完整計畫：`C:\Users\user\.claude\plans\app-1-10-2-3-3-stateless-charm.md`（規則、美術、架構都以此為準；2026-09-13 已在計畫檔裡標註保底關取消的異動）

## 一句話現況
Phase 1–6 全部完成：資料層、狀態機、投票模組、主畫面 UI、提示卡、合成音效、快捷鍵、設定頁、彩排模式、排行榜、主持人手卡都已就位。Phase 9（README.md／docs/題庫維護說明.md／CLAUDE.md）已完成。**2026-09-13：修好使用者實測回報的 4 個問題**（詳見下方「2026-09-13 修正紀錄」），測試從 170 增加到 **179 個全綠**，`npx tsc --noEmit` 0 錯誤，第 1 點（倒數不會動）已用真的瀏覽器驗證過。`npm run build` 在 Node 24 會當掉的問題仍待處理（見已知問題）。

## 2026-09-13 修正紀錄（使用者實測回報的 4 個問題）

1. **按「開始」後倒數不會真的開始計時**：根本原因是 `src/App.tsx` 的 `handleStart()` 只
   `dispatch({type:"START"})`，從來沒有呼叫 `useCountdown` 回傳的 `mainCountdown.start()`，
   所以 `CountdownClock` 的 `setInterval` 從來沒被啟動。修法：在 `handleStart()` 補上
   `mainCountdown.start()`。新增回歸測試 `src/App.countdown.test.tsx`（渲染整個 `<App/>`，
   用 `vi.useFakeTimers({toFake:[...,"performance"]})` 推進時間，驗證倒數數字真的遞減、
   30 秒後真的觸發 TIMEOUT）；也用 Browser 工具在 `http://localhost:5173` 實測過。
2. **答錯只能帶走已過關數，拿掉保底關**：`src/state/gameMachine.ts` 移除 `GameConfig.safeLevel`、
   `GameState.safeLevelReached`、`GameRecord.rewardLevel`；答錯時 `clearedLevels` 本來就是
   「答錯之前已經通過的關數」，直接沿用即可。同步移除 `LevelLadder` 的盾牌記號、
   `SettingsModal` 的保底關輸入、`src/app/settings.ts` 的 `safeLevel` 欄位。
   `ResultOverlay` 答錯文案改成「挑戰結束／成功通過 N 關，獎勵帶走！」。
3. **「開始新的一場」回不去大廳**：`gameMachine.ts` 新增 `BACK_TO_LOBBY` action（只能從
   `gameOver`/`walkedAway`/`champion` 觸發，轉場到 `lobby`）。`App.tsx` 的
   `ResultOverlay` 的「開始新的一場」按鈕改成 dispatch `BACK_TO_LOBBY`（原本直接
   `NEW_GAME` 沿用舊名字，現在會先回大廳讓主持人重新輸入名字）。上一場紀錄本來就在進到
   結算畫面那一刻已經寫進 `state.records`，回大廳不會遺失。`ResultOverlay` 也加了「查看
   排行榜」按鈕。
4. **每個題型每場只能選一次**：`GameState` 新增 `pickedCategoriesThisGame: string[]`；
   `PICK_CATEGORY` 多了可選的 `allowRepeatCategory` 欄位，選過的題型再選一次會被擋下
   （state 不變），除非明確帶 `allowRepeatCategory:true`。`REPLACE_QUESTION`（換題）不會
   動到這個清單。`CategoryPicker.tsx` 負責 UI：已選過的題型變灰並標「已選過」；如果本關
   剩下沒選過的題型全部沒有題目，才會出現「允許重選已用過的題型」的核取方塊讓主持人略過限制。

因為拿掉保底關而重寫／刪除的測試（都在 `src/state/gameMachine.test.ts`）：
「答錯且已經過保底關 → gameOver 保底成就為 safeLevel」、「答錯且沒過保底關 → gameOver
保底成就為 0」、「自訂設定：levels=2、safeLevel=1 時第 2 關答對即 champion」——改寫成不含
`safeLevel`/`rewardLevel` 的等價測試；`src/app/records.test.ts`、`src/app/settings.test.ts`、
`src/app/configReducer.test.ts` 的測試 fixture 也拿掉了 `safeLevel`/`rewardLevel` 欄位。

## 2026-09-13 第二輪試玩：待辦清單（使用者要求先 push 初版給夥伴看，以下尚未完成）

主對話在 Chrome 1530×784 實際試玩後列出 9 個問題，使用者全部要求修正。commit `e11cf55` 完成了 7、8、9（已在 Chrome 確認）。**問題 1 還沒真正修好**：`e11cf55` 統一了題型名稱的 U+FE0F 正規化，agent 說在 Browser 工具（使用內建範例 CSV）裡能選到，但主對話在使用者的 Chrome（題庫讀的是 Google 試算表的 CSV，逐格比對與本機一致）驗收時，點「憲法法庭與實務」**仍然只有 focus 外框、進不了題目**（第 1 關與第 2 關都一樣，console 沒有錯誤，其他 9 個題型正常）。下一輪要在相同條件下重現：清掉 localStorage 的 `quiz.cache.*`，再填入試算表網址，或直接用 Chrome 測試；並檢查 `App.tsx` 選題型的 handler，例如 drawQuestion 回傳 null 時被靜默忽略、`can(PICK_CATEGORY)` 回傳 false 等。

**以下 5 項還沒做**：

- **2. 版面遮擋（最重要）**：LifelineDock 蓋住 B、D 選項；倒數圓環出現後，C、D 被推到 HostBar 底下，頁面需要捲動。目標：1920×1080、1536×864、1366×768、1280×720 下都不捲動、不重疊（建議改成 grid，提示卡放選項右側的獨立欄，倒數放在題目卡旁邊）。
- **3.** 題目出現、還沒按開始時，倒數位置顯示「⏸ 不計時」，應該顯示完整秒數待命。
- **4.** 時間到沒有「⏰ 時間到！」提示；答錯結算沒寫原因。`GameState.timedOut` 已經做好（commit `e11cf55`），只差 `ResultOverlay` 與 `App.tsx` 的顯示。
- **5.** 過關、挑戰結束等遮罩太透明，背後的題目文字會透出來。
- **6.** 遊戲中沒有顯示挑戰者名字。

其他待辦：
- **題庫擴充**：每個題型 × 難度目前只有 1 題（約 10 場就會用完）。使用者同意擴充到每格 3 題（再出 100 題）；出題 agent 為了節省額度已經被停止，沒有留下檔案。之後要重新派工（法律 L26–L75、知識 K28–K77），完成後合併進 `public/sample-questions.csv`，並貼進使用者的 Google 試算表（方法：在 localhost 分頁用 JS 把 TSV 寫進剪貼簿，再到試算表 Ctrl+V；**切換工作表分頁要用 JS 觸發或確認後再貼，曾經誤貼到錯的分頁**）。
- 這一輪還沒測到：指定人幫幫忙、全場一起協助（線上投票已經接好）、帶走、全破畫面、設定頁、主持人手卡、`?` 說明浮層。

## 2026-09-13 已接好的外部服務
- **題庫試算表**「法官學院測驗表」已經發布成 CSV：`https://docs.google.com/spreadsheets/d/e/2PACX-1vQDMOTLgvahrEnSwzReVTj9CEbwKDgXjrAZ3Tu7h8mFLWTJlQr4gwfTOJjwLfSgFjbEhEeUxunp3viH/pub?gid=<gid>&single=true&output=csv`（題目 gid=0、題型 gid=471665721），逐格比對與本機 CSV 一致。
- **投票**：Google 表單網址樣板 `https://docs.google.com/forms/d/e/1FAIpQLScUjDTJ21TW_2ogSH0dVQFlfGwkxIGlkhkyi6KIjIX2Pys6Ug/viewform?usp=pp_url&entry.529223632={round}`；Apps Script 統計網址 `https://script.google.com/macros/s/AKfycbzxhxHTLXZjA9p-f7nuHUC2LWsgFHXFxDES3BW1lviabGLD26aOJewQCG08DFIVDpRa/exec`（手機實測投 B，統計收到 1 票）。
- 以上網址都存在使用者 Chrome 的 localStorage（`quiz.settings.*`、`quiz.vote.settings.v1`），換瀏覽器要重新到設定頁填入。
- GitHub repo `cosmos0409-yen/GuessActivity` 已經改為 **public**（使用者同意題目答案公開）。

## 各階段狀態
| 階段 | 狀態 | 產出 |
|---|---|---|
| Phase 1 骨架＋資料層 | ✅ 完成，已由 Phase 3 agent 獨立重跑測試驗收 | `src/data/*`、`src/styles/tokens.css` |
| Phase 2 範例題庫 | ✅ 2026-09-12 已依使用者同意套用：共 52 題，50 題上架、2 題待審（K14、K15）；新增 K26、K27 補上語言與文字難度 4、5；正解 A–D 各 13 題。查核報告寫「12 題」是筆誤，實際是 11 題 | `public/sample-questions.csv`、`public/sample-categories.csv`、`docs/題庫查證紀錄.md`、`docs/題庫查核報告.md` |
| Phase 3 狀態機＋倒數 | ✅ 完成（22 個 action） | `src/state/gameMachine.ts`、`src/hooks/useCountdown.ts` |
| 投票模組（Phase 7 的資料層） | ✅ 完成，⚠️ 尚未獨立驗收 | `src/vote/*`、`gas/Code.gs`、`gas/README.md` |
| 合成音效（Phase 6 的一部分） | ✅ 15 個音效完成；109 個測試全部通過；⚠️ `vite build` 卡住（見已知問題） | `src/audio/SoundManager.ts`、`SoundLab.tsx`、`soundlab.html`（`npm run dev` 後開 `/soundlab.html` 試聽）、`public/sfx/README.md` |
| Phase 4＋5 主畫面＋提示卡（2026-09-12 更新） | ✅ 補完：tsc 0 錯誤、109 個測試通過；兩輪流程用 DOM 驗證過；修好「結算畫面按『開始新的一場』沒反應」的 bug；soundBridge 已經接上 SoundManager。⚠️ 預覽窗格太小，沒有截圖，**美術還沒有人肉眼確認** | 同下 |
| Phase 6 快捷鍵、設定頁、彩排、排行榜、主持人手卡 | ✅ 2026-09-12 完成：`npx tsc --noEmit` 0 錯誤；測試從 109 增加到 **170**（全綠）。快捷鍵表與判斷邏輯都在 `src/hooks/hotkeys.ts`（純函式，`useHotkeys.ts` 只負責接 DOM 事件，因此沒有另外寫依賴 DOM 的測試）；設定頁改的規則/彩排模式透過 `src/app/configReducer.ts` 的本地 `SET_CONFIG` action 接進 `gameMachine` 的 `state.config`（**沒有動 `src/state/gameMachine.ts`**）| `src/hooks/hotkeys.ts`、`src/hooks/useHotkeys.ts`、`src/app/settings.ts`、`src/app/records.ts`、`src/app/configReducer.ts`、`src/components/SettingsModal.tsx`（重寫）、`src/components/Leaderboard.tsx`、`src/components/HotkeyHelpOverlay.tsx`、`src/host/HostCards.tsx`＋`hostCardsFilter.ts`＋`hostCardsMain.tsx`、`hostcards.html` |
| （舊紀錄）Phase 4＋5 | ⚠️ **中斷**：agent 最後回報「109 個測試通過」，接著跑 `npm run build` 時卡住超過 10 分鐘，被系統終止（應該就是下方的 build 問題）。沒有收到回報與截圖，**完成度未知**（後續已由 Phase 4+5 更新列補完，此為歷史紀錄）| `src/components/*`、`src/App.tsx`、`src/app/soundBridge.ts` |
| Phase 8 實測 | ❌ 未開始（下一步）| — |
| Phase 9 README.md、CLAUDE.md | ✅ 2026-09-12 完成：新增 `README.md`、`docs/題庫維護說明.md`、`CLAUDE.md`；本檔案同步更新 | `README.md`、`docs/題庫維護說明.md`、`CLAUDE.md`、`doc/handover.md` |

## 下一個 session 的第一步
1. `cd C:\猜謎程式`，先執行 `npx vitest run`，確認 170 個測試仍全部通過。
2. 看 `docs/你需要做的事.md` 裡使用者這段時間的操作紀錄與回饋（美術、規則等意見），若有新指示先處理。
3. 進行 **Phase 8 實測**：
   - 執行 `npm run dev`（**不要跑 `npm run build`**，會卡住，見下方已知問題），用 Browser 工具在 1920×1080 下實際走 3 場，檢查字級與對比（WCAG AA）。
   - 測試快捷鍵在真的瀏覽器裡是否如預期（`useHotkeys.ts` 本身沒有自動化測試，只有它委派的判斷邏輯 `hotkeys.ts` 有測試，見下方已知限制）。
   - 開 `/hostcards.html` 檢查主持人手卡的畫面與列印分頁（Ctrl+P 預覽）。
   - 網路離線測試：題庫要讀快取、投票要自動切到手動。
   - 實際用手機掃 QR 投票，量測大螢幕更新延遲。

## 已定案的關鍵決策（不要再改）
- 位置 `C:\猜謎程式\`；技術為 Vite＋React＋TS；所有資源放本機，不使用 CDN。
- 題庫是 Google 試算表發布的 CSV，讀取順序：遠端 → 本機快取 → 內建範例；「待審」的題目不會被抽到。
- **一使用提示卡，30 秒倒數就直接結束**；參賽者不計時作答，由主持人鎖定與揭曉。
- 全場協助：Google 表單加上 Apps Script 輪詢（每 2 秒一次），連續 3 次失敗才判定錯誤；一定保留手動輸入備援。
- 音效用 Web Audio 程式合成，放進 `public/sfx/<名稱>.mp3` 就可以替換。
- 院徽佔位圖是 `public/brand/emblem.jpg`（取自官網，361×393）；正式向量檔與使用同意由主辦單位提供。
- 題目：法律與冷知識各半；對象是考過國考的學員，不能出得幼稚；法律題要用 tw-legal-rag 查證。

## 已知問題與待辦
- **`npm run build` 的 vite 打包階段會卡在「39 modules transformed」**，`tsc` 本身正常。音效 agent 推測是 Node v24.11.1 與 rollup 的相容性問題，但當時 UI agent 同時在跑 dev server 與建置，**也可能是多個程序同時動專案造成的**。下一個 session 先在沒有其他程序執行的情況下重跑一次；還是卡住的話，再試 Node 22 LTS。補充：音效 agent 的轉派對象查到錯誤碼是 `STATUS_STACK_BUFFER_OVERRUN`，發生在 `@rollup/rollup-win32-x64-msvc` 的 native binding；另外它用 dev server 驗證過 `/soundlab.html` 可以正常開啟（HTTP 200）。
- 專案根目錄有除錯留下的暫存 log：`b2.log`–`b7.log`、`build_stdout.log`、`build_stderr.log`、`devserver.log`、`err.log`、`out.log`。**`.gitignore` 已經加了 `*.log`（2026-09-12）**，但這些既有檔案本身刻意沒有刪除，留給使用者自行處理。
- Phase 6 已知限制：`src/hooks/useHotkeys.ts`（接 `window.addEventListener('keydown', ...)` 的部分）沒有自動化測試，因為這個環境不方便跑依賴 DOM 的 hook 測試（vitest 設定是 `environment: "node"`）；它的判斷邏輯已經抽成純函式 `computeHotkeyAction()`（`src/hooks/hotkeys.ts`），有 25 個測試涵蓋每個按鍵在允許/不允許狀態、輸入框忽略等情境，實際鍵盤事件建議在 Phase 8 用真的瀏覽器複測一次。
- 設定頁改的「每題秒數／時間到政策／彩排模式」是透過 `src/app/configReducer.ts` 的本地 `SET_CONFIG` action 立即套用到 `state.config`（不需要重新整理頁面或開新的一場）；2026-09-13 之前 `gameMachine.ts` 是禁止修改的檔案才需要這一層，這次修 4 個問題時已經取得允許改 `gameMachine.ts`，但 `SET_CONFIG` 這層轉接還是保留，沒有必要拆掉。
- `LICENSES.md` 放在根目錄；依計畫應該放在 `public/sfx/LICENSES.md`，需要搬移。
- `@types/qrcode` 被裝在 dependencies，應該搬到 devDependencies（不影響功能）。
- 派工時要禁止 subagent 二度轉包（見記憶 no-subcontracting）。
- 需要主辦單位提供：院徽向量檔與使用同意、題庫審閱、各關的獎勵內容（沒有保底關概念了，答錯一律帶走已通過關數對應的獎勵）。
