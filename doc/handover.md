# 交接手冊 — 司法官學院 闖關猜謎 App

> 最後更新：2026-09-13（第三輪修正）
> 完整計畫：`C:\Users\user\.claude\plans\app-1-10-2-3-3-stateless-charm.md`（規則、美術、架構都以此為準；2026-09-13 已在計畫檔裡標註保底關取消的異動）

## 一句話現況
Phase 1–6 全部完成：資料層、狀態機、投票模組、主畫面 UI、提示卡、合成音效、快捷鍵、設定頁、彩排模式、排行榜、主持人手卡都已就位。Phase 9（README.md／docs/題庫維護說明.md／CLAUDE.md）已完成。**2026-09-13 第三輪：修好「第二輪試玩待辦清單」剩下的 6 個問題**（詳見下方「2026-09-13 第三輪修正紀錄」），測試從 191 增加到 **197 個全綠**，`npx tsc --noEmit` 0 錯誤，1366×768／1920×1080／1536×864／1280×720 都已用 Browser 工具實測量過版面不重疊、不捲動。`npm run build` 在 Node 24 會當掉的問題仍待處理（見已知問題，GitHub Pages 走 Actions 打包不受影響）。

## 2026-09-13 第三輪修正紀錄（「第二輪試玩：待辦清單」全部處理完畢）

1. **「憲法法庭與實務」點了沒反應（根本原因，不是 FE0F 問題）**：`e11cf55` 的 U+FE0F 正規化本身沒錯，但**真正的根本原因**在
   `src/App.tsx` 算「剩餘題數」的 `usedIdsSet`（原本只用 `state.usedQuestionIds`，也就是「這一場遊戲」用過的題目），
   完全沒把 `src/data/usedStore.ts` 的**跨場次**已用題目（localStorage `quiz.used.ids`）算進去。
   於是 `CategoryPicker` 顯示「剩餘 1 題」等錯誤數字、按鈕沒被停用，但實際呼叫
   `drawQuestionForRound()`（`src/app/gameFlow.ts`）抽題時會排除掉 `usedStore` 裡的已用題目而回傳 `null`；
   `handlePickCategory` 原本在 `question` 是 `null` 時什麼都不做（沒有 dispatch），畫面上只看得到
   按鈕的 focus 外框，完全沒有錯誤訊息 —— 這正是使用者在自己 Chrome 用 Google 試算表題庫實測時
   看到的現象（用 Browser 工具重現：先用 JS 把 `quiz.used.ids` 設成含有該題型某難度的題目 id，
   重新整理後那個題型就會顯示「剩餘 0 題」且停用，符合預期）。
   修法：`src/App.tsx` 的 `usedIdsSet` 改成 `new Set([...state.usedQuestionIds, ...getUsedIds()])`；
   另外把「靜默失敗」改成 fail loud：`handlePickCategory` 在 `drawQuestionForRound` 回傳 `null` 時，
   會 `setPickCategoryError(...)` 在選題畫面上顯示「「OOO」目前沒有可以抽的題目了，請選別的題型。」
   （沿用既有 `.tpi-poll__error` 樣式），離開選題畫面會自動清掉這個訊息。
   新增回歸測試 `src/App.pickCategory.test.tsx`（3 個測試：跨場次已用題目要讓剩餘題數正確歸零、
   沒用過的題型剩餘題數不受影響、`drawQuestionForRound` 回傳 null 時要顯示錯誤訊息而不是靜默失敗）。
   也已經在 Browser 工具用**真的 Google 試算表 CSV**（清掉 `quiz.settings.*`／`quiz.cache.*`／
   `quiz.used.ids` 後重新填入試算表網址）實測成功進入「憲法法庭與實務」的題目畫面。

2. **版面遮擋（最重要的一項）**：根本原因是 `LifelineDock` 用 `position: fixed` 疊在畫面右下角
   （蓋住選項 B、D），`HostBar` 也用 `position: fixed` 疊在畫面最下面、且允許 `flex-wrap: wrap`
   （換行後高度不固定，`.tpi-stage__content` 用猜測的 padding-bottom 保留空間，常常不夠，
   導致選項被推到 HostBar 底下、要捲頁）。
   改法：把 `.tpi-app` 改成 `height:100vh` 的 flex column（`overflow:hidden`），`.tpi-stage`
   改成 `flex:1; min-height:0`（原本是自己 `min-height:100vh`），`HostBar` 拿掉 `position:fixed`，
   變成 flex column 裡正常排版的最後一列、`flex-wrap:nowrap`（固定高度、不會換行）。
   題目畫面（`state.question && phase!=='pickCategory'`）改成 `.tpi-play`（CSS grid，
   `grid-template-columns: 1fr clamp(180px,15vw,230px)`）：左欄 `.tpi-play__main` 放題目卡＋選項
   （＋投票面板），右欄 `.tpi-play__side` 放倒數圓環（上）＋提示卡 `LifelineDock`（下，原本浮動的
   fixed dock 現在是這欄裡的正常元素）。`ExplanationCard`（詳解卡）的遮罩改用
   `bottom: var(--tpi-hostbar-h)`（新的 CSS 變數，等於 HostBar 的固定高度）精準保留 HostBar 的空間，
   不再用猜的 padding。
   已用 Browser 工具在 1920×1080、1536×864、1366×768、1280×720 四個尺寸下，分別在「按開始後」
   「使用提示卡後」「詳解卡出現時」量測 4 個選項／提示卡／HostBar／倒數的 `getBoundingClientRect()`，
   確認彼此不重疊、都在 viewport 內，且 `document.documentElement.scrollHeight === innerHeight`
   （量測數字見這次對話紀錄，不重複貼在這裡）。改動的檔案：`src/App.tsx`（JSX 結構）、
   `src/styles/app.css`（`.tpi-app`／`.tpi-stage`／`.tpi-stage__content`／新增 `.tpi-play*`／
   `.tpi-lifeline-dock`／`.tpi-hostbar`／`.tpi-explanation`／`.tpi-picker`／`.tpi-options` 等區塊）。
   沒有寫自動化測試（CSS/版面問題 jsdom 測不出來，只能真的瀏覽器量測；這點在原始指示裡也只要求
   A、C、D 要有測試）。

3. **倒數待命顯示「不計時」**：根本原因是 `CountdownRing` 的 `stopped` 算成
   `state.phase !== "counting"`，題目剛出現（`questionShown`，還沒按開始）也被誤判成「不計時」。
   修法：改成 `stopped={!["questionShown", "counting"].includes(state.phase)}`——「不計時」只在
   `lifeline`／`answering`／`locked`（提示卡永久結束倒數之後）才顯示；`questionShown` 時
   `remainingMs` 本來就等於 `totalMs`（`mainCountdown.reset()` 剛跑過），所以會自動顯示完整秒數待命。
   新增回歸測試 `src/App.timeUp.test.tsx`（驗證選完題型、還沒按開始時沒有「不計時」文字、
   倒數數字顯示滿秒數；按下開始後倒數會遞減）。

4. **時間到沒有明顯提示、結算沒寫原因**：新增 `timeUpNotice` 狀態，`mainCountdown.onExpire` 觸發時
   `setTimeUpNotice(true)`，1.5 秒後（`window.setTimeout`）自動關閉；畫面上顯示置中的
   「⏰ 時間到！」（`.tpi-timeup`，深色遮罩＋backdrop-blur＋紅字脈動動畫），選新題目時會自動清掉。
   `ResultOverlay` 新增 `timedOut` prop，`gameOver` 文案改成視 `state.timedOut` 顯示「時間到，
   ……」或「答錯了，……」（`state.timedOut` 在 `NEXT` action 轉場到 `gameOver` 的當下還沒被重設，
   所以可以直接拿來判斷「這次答錯是不是因為時間到」）。同一個 `src/App.timeUp.test.tsx` 也涵蓋了
   「⏰ 時間到！」1.5 秒後消失、結算畫面文字含「時間到」的測試。

5. **過關／挑戰結束／帶走／全破遮罩太透明**：`.tpi-result` 背景從 `rgba(12,13,36,0.82)` 改成
   `rgba(8,9,28,0.96)` 加 `backdrop-filter: blur(6px)`；四種結果畫面的內容都包進新的
   `.tpi-result__card`（`rgba(20,22,56,0.92)`、圓角、邊框、陰影），不再是文字直接疊在半透明遮罩上。
   檔案：`src/components/ResultOverlay.tsx`、`src/styles/app.css`。沒有另外寫測試（純視覺樣式，
   既有的過關／結算流程測試——`src/App.countdown.test.tsx`、`src/state/gameMachine.test.ts`——
   已經覆蓋這幾個畫面會不會出現，樣式本身用 Browser 工具肉眼確認過）。

6. **遊戲中沒有顯示挑戰者名字**：`Stage` 元件新增可選的 `contestantName` prop，顯示在標題列右側
   （`.tpi-stage__contestant`，金色系膠囊樣式），`App.tsx` 傳入 `state.contestantName`
   （`NEW_GAME` action 時就會存進 `GameState.contestantName`，原本就有這個欄位只是沒有用在畫面上）。
   只在 Stage 有 children 時渲染（也就是遊戲進行中的畫面），大廳/開場畫面不受影響。

沿用第二輪就有、這次仍然沒有動的部分：`docs/你需要做的事.md` 提到的題庫擴充仍未開始；
`?` 說明浮層、主持人手卡、設定頁這次沒有重新測過（這次範圍限定在上面 6 項）。

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

## 2026-09-13 第二輪試玩：待辦清單（歷史紀錄，第三輪已全部修完，見上方「第三輪修正紀錄」）

主對話在 Chrome 1530×784 實際試玩後列出 9 個問題，使用者全部要求修正。commit `e11cf55` 完成了 7、8、9（已在 Chrome 確認）。問題 1（憲法法庭與實務點了沒反應）、2（版面遮擋）、3（不計時待命）、4（時間到提示／結算原因）、5（遮罩太透明）、6（沒顯示挑戰者名字）**已在 2026-09-13 第三輪全部修好**，根本原因與修法見本檔最上方「2026-09-13 第三輪修正紀錄」，不重複列在這裡。

其他待辦（第三輪範圍之外，仍未處理）：
- **題庫擴充（2026-09-13 已出題，尚未合併）**：新的 100 題已經寫好：`docs/新題-法律.csv`（L26–L75，50 題全部上架）與 `docs/新題-知識.csv`（K28–K77，49 題上架，K72 待審），查證紀錄是同名的 `-查證.md`。**下一步**：(1) 派一個新的 subagent 做獨立查核（前一次查核為了省額度被停止，還沒有報告）；(2) 依查核結果修正後，合併進 `public/sample-questions.csv`；(3) 貼進使用者的 Google 試算表「題目」分頁最後一列之後（方法：在 localhost 分頁用 JS 把 TSV 寫進剪貼簿，再到試算表 Ctrl+V；**切換工作表分頁要用 JS 觸發並確認後再貼，曾經誤貼到錯的分頁**），然後下載發布出來的 CSV 逐格比對。
- **2026-09-14 更新**：100 題新題目獨立查核通過（`docs/新題查核報告.md`：99 題 PASS，K72 維持待審，沒有事實錯誤），**已經合併進 `public/sample-questions.csv`**：共 152 題，上架 149、待審 3（K14、K15、K72）；只有「數字的秘密」難度 3 是 2 題，其他每格都是 3 題。**已貼進使用者的 Google 試算表**（「題目」分頁 A54:R153），並下載發布版 CSV 逐格比對：153 列、0 差異（commit `17cc33e`；K50 的選項原本外面有引號，貼上時被試算表去掉，已把本機改成一致）。操作注意：`navigator.clipboard.writeText` 只能在前景分頁、而且 Chrome 視窗在最前面時使用；**不要用座標點選儲存格**（視窗大小一變就會點到欄標題），改用網址 `#gid=0&range=A54` 跳到指定儲存格，並先截圖確認名稱方塊再貼上。
- **2026-09-14 搶答系統改用 Cloudflare**：使用者提供了 Cloudflare Workers ＋ SQLite-backed Durable Objects 的規格書，確認與裁決都寫在 **`docs/搶答系統-Cloudflare規格確認.md`**（手機顯示色塊加選項文字、兩種題庫來源加圖片題、放在同一個 repo 的 `live-quiz/`、T1–T4 技術修正全部採用）。Supabase 方案（`docs/搶答系統計畫.md`）作廢。下一步是階段 0：使用者註冊 Cloudflare、執行 `npx wrangler login`；免費額度的查證報告在 scratchpad 的 `cloudflare-limits.md`（研究中）。
- **2026-09-14 搶答系統階段 1 完成並部署**：程式在 `live-quiz/`（原生 HTML/JS，沒有打包工具）；正式網址 **https://live-quiz.cosmos0409.workers.dev**（使用者的 Cloudflare 帳號，workers.dev 子網域是 `cosmos0409`，可以在 dashboard 的 Workers & Pages 右側 Subdomain 旁的鉛筆圖示改名）。部署：在 `live-quiz/` 執行 `CI=1 npx wrangler deploy`（wrangler 4.131.1，已經 `wrangler login`）；本機：`npx wrangler dev --port 8787`。已完成：建立房間（`POST /api/rooms`）、hostToken 驗證、WebSocket Hibernation、玩家加入就寫入 SQLite、名單只給主持人、playerId 重連、同名自動加 `#2`。本機 Node 模擬測試 11 項全部通過（測試腳本目前寫在指令裡，還沒存成檔案；階段 4 會存成 `tools/`）。踩過的坑：`webSocketClose` 裡把 1005 代碼照抄傳給 `ws.close()` 會丟出 InvalidAccessError。**下一步：使用者用電腦加手機測試階段 1 → 階段 2（完整答題流程）**。
- **2026-09-14 搶答系統階段 2 完成並部署**（使用者同意在實機測試階段 1 前先做；階段 1 已打 git tag `live-quiz-stage-1` 可退回）。加入 QR code（`public/shared/qrcode.mjs`，qrcode-generator 2.0.4，MIT）、完整答題流程（開始 → 出題 → DO alarm 倒數 → 作答 → 結算 → 下一題 → 結束）、伺服器計時計分（`src/scoring.js`）、只採計第一次作答、全員答完提前結算、前 10 名＋前 3 名 4 位數驗證碼、出題中重連。**測試**：`node tools/flow-test.mjs [網址]`（32 項；不帶參數測本機 127.0.0.1:8787）。踩過的坑：CSS 的 `.stack{display:flex}` 會蓋過 `[hidden]`，已在 style.css 最前面加 `[hidden]{display:none!important}`。仍然是陽春介面（階段 3 美化）；尚未實作：踢人、主持人斷線恢復的完整測試、壓力測試（階段 4）、試算表題庫與圖片題（階段 5）。**真實手機＋行動網路尚未測試**。
- ⚠️ **這台電腦的 Bash PATH 是 Windows 格式**，會找不到 node、grep、ls。每個指令前面先執行 `export PATH="/usr/bin:/mingw64/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:/c/Program Files/GitHub CLI:/c/Users/user/AppData/Roaming/npm"`。
- **（舊）全場搶答系統（Kahoot 式）**：規劃在 `docs/搶答系統計畫.md`，使用者已經決定：自己做、用 Supabase、10 題 × 20 秒、另開「搶答題」分頁、圖片由使用者提供。**等待使用者**：註冊 Supabase 並提供 Project URL 與 anon key、提供圖片檔、核可計畫後才開工。研究報告（Kahoot 計分公式、各方案額度與來源）在該 session 的 scratchpad `kahoot-research.md`，重點已經整理進計畫檔。
- 這一輪還沒測到：指定人幫幫忙、全場一起協助（線上投票已經接好）、帶走、全破畫面、設定頁、主持人手卡、`?` 說明浮層。

## 2026-09-13 已接好的外部服務
- **題庫試算表**「法官學院測驗表」已經發布成 CSV：`https://docs.google.com/spreadsheets/d/e/2PACX-1vQDMOTLgvahrEnSwzReVTj9CEbwKDgXjrAZ3Tu7h8mFLWTJlQr4gwfTOJjwLfSgFjbEhEeUxunp3viH/pub?gid=<gid>&single=true&output=csv`（題目 gid=0、題型 gid=471665721），逐格比對與本機 CSV 一致。
- **投票**：Google 表單網址樣板 `https://docs.google.com/forms/d/e/1FAIpQLScUjDTJ21TW_2ogSH0dVQFlfGwkxIGlkhkyi6KIjIX2Pys6Ug/viewform?usp=pp_url&entry.529223632={round}`；Apps Script 統計網址 `https://script.google.com/macros/s/AKfycbzxhxHTLXZjA9p-f7nuHUC2LWsgFHXFxDES3BW1lviabGLD26aOJewQCG08DFIVDpRa/exec`（手機實測投 B，統計收到 1 票）。
- 以上網址都存在使用者 Chrome 的 localStorage（`quiz.settings.*`、`quiz.vote.settings.v1`），換瀏覽器要重新到設定頁填入。
- GitHub repo `cosmos0409-yen/GuessActivity` 已經改為 **public**（使用者同意題目答案公開）。
- **GitHub Pages**：https://cosmos0409-yen.github.io/GuessActivity/ 。推到 main 就會由 `.github/workflows/deploy-pages.yml` 在 ubuntu + Node 22 上自動打包並部署（避開本機 Node 24 打包會當掉的問題）。`vite.config.ts` 的 `base` 只在 `GITHUB_ACTIONS=true` 時設為 `/GuessActivity/`，本機 dev 維持 `/`。程式裡指向 `public/` 的路徑一律用 `src/utils/baseUrl.ts` 的 `assetUrl()`（音效用 `import.meta.env.BASE_URL`），**新增資源路徑時不要寫死 `/` 開頭**。Pages 版的 localStorage 和 localhost 是分開的，第一次使用要到遊戲設定頁重新填 4 個網址（見上）。

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
1. `cd C:\猜謎程式`，先執行 `npx vitest run`，確認 197 個測試仍全部通過。
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
