# 交接手冊 — 司法官學院 闖關猜謎 App

> 最後更新：2026-09-15（選拔賽換上學院題 8 題、決賽新增【學院知多少】並改成題型不分欄；圖片題待使用者提供）
> 完整計畫：`C:\Users\user\.claude\plans\app-1-10-2-3-3-stateless-charm.md`（規則、美術、架構都以此為準；2026-09-13 已在計畫檔裡標註保底關取消的異動）

## 🚀 下一個 session 從這裡開始（2026-09-14）

這個 repo 裡有**兩個獨立的系統**，同一場活動先後使用：

| 系統 | 位置 | 網址 | 狀態 |
|---|---|---|---|
| **全場搶答**（Kahoot 式，150 人選 3 人） | `live-quiz/`（原生 HTML/JS＋Cloudflare Workers＋SQLite-backed Durable Objects） | https://live-quiz.cosmos0409.workers.dev | 階段 1–4 已部署（階段 4 版本 94ddea51）；階段 5 本機完成、**尚未部署**；使用者實機測過階段 1–2 |
| **闖關猜謎**（百萬小學堂式，3 人上台） | 專案根目錄（Vite＋React＋TS） | https://cosmos0409-yen.github.io/GuessActivity/ | 功能完成；題庫 152 題（上架 149）已同步到使用者的 Google 試算表 |

**搶答系統階段 4（2026-09-14 完成並部署）**：主持人踢人、主持人斷線恢復、150 人壓力測試都已完成；報告在 `docs/搶答系統-壓力測試報告.md`。Claude 的部署指令被權限規則擋下，改由**使用者自己在 PowerShell 部署**（在 `C:\猜謎程式\live-quiz` 執行 `npx wrangler deploy`，版本 `94ddea51`），並對正式網址跑 150 人壓力測試，35／35 通過，結算約 0.15 秒。**下一步：使用者用真的手機測試（鎖屏、切換網路、踢人畫面）**，之後進入階段 5。細節見下方「搶答系統階段 4 紀錄」。

**搶答系統剩下的階段**（規格確認文件：`docs/搶答系統-Cloudflare規格確認.md`，每個階段做完都要停下來讓使用者測試）：
- **階段 5 題庫（2026-09-14 程式完成、本機測過、已 commit，⚠️ 尚未部署）**：
  - 主持人建立房間前選「內建題庫」或「Google 試算表「搶答題」分頁」（貼發布的 CSV 網址 → 讀取 → 預覽只列題目與秒數、不列正解）。讀取成功會存一份在 localStorage（`liveQuiz.bankCache`），現場讀不到試算表時自動改用並寫出存下的時間。
  - 解析：`public/shared/question-csv.js`（欄位：題目、圖片網址、A–D、正解、秒數、狀態；C、D 可留空＝2／3 選 1；最多 50 題；不合格整列跳過並列出原因）。驗證：`src/question-bank.js`（伺服器最終把關，`/api/rooms` 的 body 帶 `{questions}`，不合格回 400 並列出第幾題，超過 100 KB 回 413）。
  - 題庫在建房時存進 DO 的 SQLite（meta `questions`、`bankSource`），`game-room.js` 全部改用 `this.bank()`；階段 5 以前的舊房間沒有這筆資料，沿用內建題庫。玩家端仍然只收到選項文字（沒有題目本文、圖片、正解）。
  - 圖片題：`圖片網址` 填檔名＝`/img/檔名`（檔案放 `live-quiz/public/img/`，要重新部署），或 `https://` 網址；擋掉 `http://`、子資料夾與 `..`。測試圖 `public/img/sample.svg`（使用者要求：圖片上不能印檔名，已拿掉；說明文件也提醒圖檔名稱不要透露答案，建議用 q01.jpg 這種中性名稱）。
  - 版面：手機 2 選 1 是上下兩大塊、3 選 1 第三個選項佔滿最後一列；投影幕 3 選 1 同樣處理。
  - 範本：`docs/搶答題範本.csv`；給非工程師的欄位說明已加進 `docs/題庫維護說明.md` 最後一節。
  - 測試：新增 `node tools/bank-test.mjs`（23 項，純 Node）；`flow-test.mjs` 42 → **53 項**（上傳題庫、二選一、正解不外流、不合格題庫、413、圖片可讀）；150 人壓力測試 35／35。瀏覽器實測：用使用者現有的「題目」分頁（欄位名稱相容）讀到 50 題（上限）並成功出題；圖片題、2／3 選 1 版面都確認過，沒有 console 錯誤。
  - **試算表「搶答題」分頁已建立（2026-09-14，Claude 用使用者的 Chrome 輸入 5 列範例題）**：gid=1063568289，整份試算表原本就是「發布到網路」，所以 CSV 網址直接可用：`https://docs.google.com/spreadsheets/d/e/2PACX-1vQDMOTLgvahrEnSwzReVTj9CEbwKDgXjrAZ3Tu7h8mFLWTJlQr4gwfTOJjwLfSgFjbEhEeUxunp3viH/pub?gid=1063568289&single=true&output=csv`（解析結果 4 題、0 警告；「待審」那列被跳過）。編輯網址 `https://docs.google.com/spreadsheets/d/11pdA3ihVsfwWnpeCPwtvJTio29CVRlG51IikwY0Fj2E/edit`。操作注意：Chrome 視窗在背景時剪貼簿不能用，改用逐格輸入；**中文要先按 F2 進入編輯模式再輸入**（否則會被吃掉），Enter 會進入編輯而不是換列，每列開頭用網址 `#gid=…&range=A2` 跳過去並檢查分頁名稱與名稱方塊。
  - **等使用者**：換成正式的 10 題與圖片；自己部署；實機測試。修改前的檔案備份在 `~/.claude/ops/backup-20260914/live-quiz-stage5/`。
- **千元小學堂改名＋選拔賽／決賽銜接＋投票彈窗（2026-09-14，使用者追加，⚠️ 尚未部署、尚未 commit）**：
  - **改名**：搶答系統＝「司法官學院千元小學堂－選拔賽」（`live-quiz/public/` 的 index／host／play 三頁）；闖關猜謎＝「司法官學院千元小學堂－決賽」（`index.html`、`hostcards.html`、`src/App.tsx` 的 `DEFAULT_TITLE`；瀏覽器裡存的若是舊預設「司法官學院 闖關大挑戰」會自動換成新標題，主持人自己改過的標題不受影響）。
  - **選拔賽前 10 名**：`game-room.js` 的 `LEADERBOARD_SIZE` 5 → 10；`host.css` 在高度 ≤ 900px 時排成兩欄（1–5、6–10），1366×768 實測「下一題」按鈕在畫面內、不捲動。答案揭曉畫面也顯示題目圖片（`#r-image`）。
  - **選拔賽 → 決賽**：最終排名畫面的「前往決賽 →」開新分頁到 `https://cosmos0409-yen.github.io/GuessActivity/?c=第1名&c=第2名&c=第3名`（`host.js` 的 `FINALS_URL`）。決賽用 `src/app/finalists.ts` 的 `parseFinalists` 讀網址（重複的 `c` 參數，暱稱有逗號也不會切錯；最多 3 位、每位 20 字），`Lobby` 顯示成按鈕，點一下帶入名字，已挑戰過的標「已挑戰」。兩套系統不同網域、localStorage 不互通，所以用網址傳。最終排名畫面的「建立新房間」「前往決賽 →」放在「最終排名」標題同一列的右側（`#final .controls` 絕對定位）：放在區塊下方時 1366×768 要捲動才看得到，固定在右下角時會蓋到第 3 名的柱子。
  - **全場一起協助**（原本 1366×768 會把題目文字擠掉、收票後結果完全不顯示）：`AudiencePoll` 改成彈窗（題目本文＋四個選項文字＋大 QR code＋長條圖，保留 HostBar），「收起」後變成右側欄的 `PollChip`（票照收，不蓋選項），收票後 `state.pollResult` 以百分比長條顯示在 `OptionGrid` 四個選項上，直到換下一題。1366×768 實測：彈窗在 HostBar 上方、題目完整、QR 300px；收起後小視窗不重疊選項。
  - **網址寫進程式**：`src/vote/voteSettings.ts` 的 `DEFAULT_VOTE_SETTINGS`（正式表單＋Apps Script、預設啟用；舊版存的空白網址會改用預設）、`src/data/questionSource.ts` 的 `DEFAULT_REMOTE_URLS`（題目 gid=0、題型 gid=471665721；設定頁填的仍優先）。三個 App 測試的假 fetch 因此改成用 `gid=471665721` 辨認題型 CSV。
  - **測試**：vitest 197 → **210**（新增 `src/app/finalists.test.ts`、`src/components/OptionGrid.test.tsx`、`src/components/Lobby.test.tsx`、`src/App.poll.test.tsx`，`voteSettings.test.ts` 加 2 項），`npx tsc --noEmit` 0 錯誤；live-quiz flow-test 53、bank-test 全部通過。備份在 `~/.claude/ops/backup-20260914/finals-poll/`。
  - **GitHub Actions 額度**：repo 是 public，2026-09-14 查過最近 6 次 Pages 部署都成功；若真的被擋，只有決賽網站不會更新，選拔賽（Cloudflare）不受影響。
- **題目圖片預先載入（2026-09-14，階段 6 之後使用者追加）**：主持人收到題庫（`joined`，含重新連線）就用 `new Image()` 在背景下載全部圖片（`public/host.js` 的 `preloadImages`，同一網址只下載一次），出題時直接用瀏覽器快取。等待室「開始遊戲」下方的 `#img-status` 顯示載入結果：全部成功綠字、讀不到的列出「第 N 題」紅字（只寫題號不寫檔名，因為等待室會投影）；題庫沒有圖片時不顯示。玩家端不受影響。備份在 `~/.claude/ops/backup-20260914/preload/`。
- **學院題換上＋決賽題型不分欄（2026-09-15，⚠️ 尚未 commit）**：
  - **題目來源**：`live-quiz/近年來司法官學院沒有辦理以下哪個司法法務人員研習或訓練班.docx`（使用者提供，23 題；有一題只剩重複的「答案（A）」、題目遺失，依使用者指示拿掉）。
  - **選拔賽（試算表「搶答題」分頁）**：取代原本 5 列範例，換成 8 題學院題。選項已打散（年份、期間、比例這類有大小順序的不動），正解分布 A2／B3／C1／D2；「搬家年份」題幹刪掉「44 年創立」「81 號」避免洩漏決賽題；處室題補成「何者正確」；秒數 20／25／30。使用者事後更正：受訓期間題的「第1期至第14期」改為「第1期至第2期」（已改）。
  - **圖片題 2 題（第 9、10 題，已加進「搶答題」）**：`live-quiz/public/img/q01.jpg`（導師小時候照片，正解 C 陳幽蘭導師，選項已打散）、`q02.jpg`（四格拼圖，選項照畫面順序改成 左1／左2／右2／右1，正解 A，25 秒）。原圖檔名含答案，放在 `live-quiz/` 根目錄、**不要 commit**（Cloudflare 只部署 `public/`）。10 題正解分布 A3／B3／C2／D2；用 `parseQuestionCsv`＋`validateQuestions` 讀發布版 CSV：10 題、0 警告。**圖片要等使用者執行 `npx wrangler deploy` 才會上線。**
  - 使用者另提供 `交流活動題目(1).pdf`（部分題目的詳解）：逐題對過答案一致；選拔賽沒有詳解欄位，圖片題 2 的各選項人物（B 凱平導師、C 有容導師、D 學員李國瑜小時候）、設備題（其實只有一台販賣機，67 期學務資料第 11 頁）由主持人口頭補充。K89 使用者決定維持原詳解。
  - **決賽（「題目」分頁 K78–K92、「題型」分頁）**：新增題型「🏫 學院知多少」（知識、#057833、放在「題型」分頁第一列）；其餘 15 題放這裡，難度 1–5 各 3 題；詳解由 Claude 依題目本身的資訊寫最短版（使用者可再改）；K90 貪污條例題已用 tw-legal-rag 查證第 4、5、6 條（Z＝6）。**法條冷門角落、憲法法庭與實務、比較法大觀園三個題型「啟用」改成「否」**（題目保留）。院徽動物題「獨角獸／獬豸」並列是使用者決定維持原樣。
  - **選題型畫面**：`CategoryPicker.tsx` 拿掉「⚖️ 法律／🧠 知識」兩欄，所有啟用題型照「題型」分頁順序排在同一個格子（`.tpi-picker__panel` + `.tpi-picker__grid`，欄數 `--tpi-picker-cols` = ceil(題型數/2)、最多 5）。「領域」欄位仍然必填（驗證、主持人手卡、題目標記會用到），只是不再影響選題畫面。
  - **驗證**：`npx tsc --noEmit` 0 錯誤、vitest 210 通過；試算表讀回的內容與本機檔 SHA-256 一致；用 `parseQuestionsCsv`／`parseCategoriesCsv` 解析「發布到網路」CSV：0 警告、啟用 8 個題型；dev App 重新讀取題庫（167 題、0 警告）後選題畫面為 4×2、學院知多少在第一張。備份在 `~/.claude/ops/backup-20260915/category-picker/`。
  - **試算表操作新做法（比 09-14 的逐格輸入可靠）**：`Ctrl+J` 聚焦名稱方塊，輸入 `'分頁名'!A154` 跳到指定分頁與儲存格；接著在頁面上對 `document.activeElement`（`cell-input`）送一個帶 `text/plain` TSV 的合成 `paste` 事件，一次貼上整塊。貼上前先檢查目前分頁名稱（`.docs-sheet-active-tab`）與名稱方塊（`#t-name-box`）是否符合，不符就不貼。Chrome 視窗縮放會變，**不要用座標點分頁或名稱方塊**。讀回用 `/gviz/tq?tqx=out:csv&sheet=分頁名`。
- **實機測試後的版面、投票、音效修正（2026-09-17，⚠️ 選拔賽尚未部署）**：使用者要求以 **1366×768** 為基準，每個階段每一題都要完整顯示（可縮字）、投票延長到 1 分鐘、選拔賽加音效。已寫進 CLAUDE.md 硬性約束。
  - **稽核方法**（改版面後照做）：選拔賽從英文路徑複製版跑 `wrangler dev`（host.js 的試算表網址在複製版清空，否則瀏覽器預覽會被 auto mode 以「會外洩的程式碼」擋下），`POST /api/rooms` 上傳 10 題正式題＋5 題測試題，`tools/bots.mjs` 放 10 個機器人＋手機分頁（360×740）當不作答的玩家，主持人分頁 1366×768／1920×1080 逐題量「元素超出視窗、data-fit 格子裁切、整頁捲動、按鈕在畫面外」。決賽在 `public/__audit/` 暫放極端題庫（K90 題目 92 字、K89 選項 40 字、K50 詳解最長、L74 冷知識最長、合成最壞），localStorage 指過去後自動跑 5 關，**量完刪檔並清 localStorage**。瀏覽器預覽分頁在背景時 requestAnimationFrame 與 CSS 動畫不會跑：倒數數字不動、進場動畫停在起點，量測時要暫停動畫（`.fit-measuring`）。
  - **稽核發現（修改前）**：選拔賽兩題圖片題在 1366×768 和 1920×1080 都有選項／按鈕被擠出畫面；最終排名頒獎台超出；手機每頁多 11px 捲動。決賽題目／選項／詳解字級固定 52／38／34px，1366×768 下 K90、K89 要捲動約 200px；投票彈窗選項用 ellipsis 截斷（任何解析度）。
  - **Phase 1 選拔賽**：`host.html` 出題改成 `#q-layout`（圖、題目卡、倒數、作答條、選項同一個 grid）、答案揭曉 `#r-layout`；`body.fit` 讓出題／揭曉／最終排名固定一個螢幕高。`host.js` 的 `applyImageLayout()` 依 `naturalWidth/naturalHeight` 加 `.portrait`（< 1.1，圖左字右，欄寬 `--img-col` = 版面高×比例、最多 42%）或 `.landscape`（圖在題目下方；出題時選項都 ≤ 8 字加 `.one-row`）；`fitVisibleSection()` 把 `--fit` 從 1 往下調到 0.5，直到 section 與 `[data-fit]` 都不裁切、橫式圖至少佔版面一半高（先縮字把高度讓給照片），CSS 用 `max(28px, calc(var(--fit) * …))` 保底。排程用 `queueMicrotask`（不用 rAF，背景分頁不會跑），量的時候加 `.fit-measuring` 停掉動畫（頒獎台升起的位移曾被誤判成超出、把字縮到最小）。頒獎台柱高、名字也乘 `--fit`。手機 `play.css` 用 `body.player:has(#question)` flex 取代 `calc(100dvh - 90px)`。結果：15 題出題／揭曉＋最終排名在 1366×768 全部通過；四格拼圖 563×209 被切 → 755×280（1920：1125×417）；直式導師照揭曉 127×169 → 323×431；手機捲動 0；flow-test 53、bank-test 全過。
  - **Phase 2 決賽**：`tokens.css` 字級改 `clamp(28px, 4.8vh, 52px)`／`clamp(22px, 3.5vh, 38px)`／`clamp(20px, 3.15vh, 34px)`；新增 `src/app/fitText.ts`（`fitToBox`＋`useFitText` hook，設 `--tpi-fit`，resize 與容器內圖片 load 時重算），接在 `App.tsx` 的 `.tpi-play__main`（deps：題目、phase、刪除選項、投票結果、投票錯誤提示）、`ExplanationCard`、`AudiencePoll`；題目卡內距、選項間距也乘 `--tpi-fit`。投票彈窗選項改成 grid 兩行（文字可換行、長條在下一行），QR code 下限 180px。`pollSeconds` 預設 20 → **60**（`gameMachine.test.ts` 同步）；「提早收票」按鈕原本就有。結果（1366×768）：K90／K89／K50／L74 出題、揭曉、詳解卡字級不用縮就通過；合成最壞題出題 fit 0.88、投票彈窗 0.88、收票後 0.72、揭曉停在下限但不裁切；真實 K89 收票後 fit 0.88（1920：0.92，原本要捲 84px）；收票倒數從 59 秒開始。tsc 0、vitest 211 過。
  - **Phase 3 選拔賽音效（做法 A：合成）**：`SoundManager.startBed(style)` 新增 `"lobby"` 類型（C–Am–F–G 中頻琶音，480ms 一拍；不同類型會先停舊的；決賽不傳參數行為不變，補 1 個測試）。`live-quiz/tools/build-sound.mjs` 用根目錄 esbuild 把 SoundManager.ts 打包成 `public/shared/sound.js`（define `import.meta.env.BASE_URL` 為 `"/"`）。`host.js`：`applySceneSound()` 依畫面播放（等待室 lobby 背景、出題 questionShow＋countdown 背景、最後 5 秒 `setBedUrgent`、時間到 timeUp、揭曉 correct、最終排名 champion），以「畫面＋題號」去重；`pointerdown`／`keydown` 解鎖；工具列新增 🔊／🔇（`quiz.sound.muted`）、音量滑桿、重新整理後的「🔈 點一下開啟聲音」。沒有呼叫 `preloadOverrides()`（避免 15 個 mp3 404）。驗證：攔 `OscillatorNode.prototype.start` 計數——等待室 3 秒 +7、出題 2.5 秒 +5、揭曉 +5 後 2.5 秒 +0（節拍已停）、靜音切換與 localStorage、重新整理後提示出現且點擊後消失、工具列 1366×768 不溢出；**最後 5 秒加快、時間到音效、慶祝音在背景分頁無法驗證（rAF 不跑），要使用者實際聽**。
  - **待辦**：使用者用 deploy.ps1 部署選拔賽並實際試聽；決賽已 commit／push（見 git log）。備份在 `~/.claude/ops/backup-20260917/`（layout-phase1、finals-phase2、sound-phase3、docs-phase5）。
- **⚠️ wrangler 在中文路徑會當掉（2026-09-15 查明）**：wrangler 4.131.1＋Node 24.11.1 只要**工作目錄路徑含中文**（`C:\猜謎程式\live-quiz`），印完版本號就以 `0xC0000409`（STATUS_STACK_BUFFER_OVERRUN）結束、不寫任何錯誤，PowerShell 看起來像卡住。對照測試：同一份專案放英文路徑可以打包；目錄連結（junction）無效（會追回真實路徑）；wrangler 程式本身放在中文路徑沒關係。與 `npm run build` 卡死是同一個錯誤碼，很可能同因（未驗證）。**解法**：`live-quiz/tools/deploy.ps1` 把 `src`、`public`、`wrangler.jsonc`、`package.json` 複製到 `%TEMP%\live-quiz-deploy` 再部署；使用者在 live-quiz 執行 `powershell -ExecutionPolicy Bypass -File tools\deploy.ps1`（加 `-DryRun` 只打包）。2026-09-15 用它部署成功。本機 `wrangler dev` 同理要從英文路徑的複製版執行。使用者考慮把整個專案資料夾改成英文名稱（建議 `C:\GuessActivity`，改名需關掉所有開在此資料夾的程式，改完要更新 5 份文件中的 10 處路徑），尚未決定。docx 與兩張檔名含答案的原圖已移到 `C:\猜謎程式\題目素材\`。
- **選拔賽測試題庫（2026-09-17，⚠️ 尚未部署、尚未 commit）**：使用者要求彩排用假題目，避免正式題目外流。`src/questions.js` 改成 5 題：4 題文字（20／20／25／30 秒，含一題長選項「何者錯誤」）＋1 題圖片（`/img/sample.svg`，天平圖案）。主持人頁選項改名為「測試題庫（彩排用，不含正式題目）」（預設）與「正式題庫：Google 試算表「搶答題」分頁」；`live-quiz/README.md` 同步。驗證：`bank-test` 全過；從英文路徑複製版跑 `wrangler dev`，`flow-test` 全過；瀏覽器選測試題庫建房，等待室顯示「✓ 題目圖片 1 張都已預先載入」。備份在 `~/.claude/ops/backup-20260917/live-quiz-testbank/`。**等使用者用 deploy.ps1 部署。**
  - **正式題庫網址寫進程式（同日，使用者選擇）**：`public/host.js` 新增 `DEFAULT_SHEET_URL`（「搶答題」分頁 gid=1063568289 的發布 CSV），這台電腦沒存過網址時自動填入，換電腦不用再貼；題庫預設仍是「測試題庫」。**⚠️ 與 CLAUDE.md「正解只能傳給主持人」衝突**：`host.js` 公開，有心人可從網址讀到正解。Claude 提出三案（專用書籤連結 `#sheet=` ／寫進程式／伺服器端網址＋主持人密碼），使用者因要換電腦選擇寫進程式。驗證：`node --check` 語法 OK；用 `parseQuestionCsv` 讀預設網址 10 題、0 警告、圖片 2 題。瀏覽器實測被 auto mode 權限分類器以「會外洩的程式碼」擋下，未實測，**部署後請使用者確認選「正式題庫」時網址已填好**。
  - **「搶答題」新增 J 欄「詳解」（同日）**：依 `交流活動題目(1).pdf` 貼上第 9 列（設備：其實只有一台販賣機，67 期學務資料第 11 頁）與第 11 列（蓄鬍導師：左1 哲瑋、左2 凱平、右2 學員李國瑜小時候、右1 有容；左2 照片與 PDF 不同，待使用者確認）。解析器依標題讀欄位，多一欄不影響（10 題、0 警告）；選拔賽畫面不顯示詳解，僅供主持人參考。使用者自行把第 7 列處室題改成「何者錯誤」，並確認正解仍為 C（與 PDF 原題「主計室與油印室同位於2樓」為正解的寫法不同，以使用者為準）。試算表為自動重新發布，已確認發布版 CSV 與編輯版一致。
- **階段 6 文件（2026-09-14 完成）**：新增 `live-quiz/README.md`（架構、安裝、本機執行、部署、活動當天流程與出狀況的處理、換題庫與圖片題、測試指令、免費額度、疑難排解）；根目錄 `README.md` 開頭加上兩套系統的對照與連結；根目錄 `CLAUDE.md` 加上 live-quiz 的目錄列、常用指令、「部署由使用者執行」與「正解只能傳給主持人」兩條約束。**CLAUDE.md 的處理方式**：工作目錄裡原本就有一處不是 Claude 改的修改（刪掉檔尾的 `claude-md-12-rules` 管理區塊），commit 時只加入 Claude 新增的行，那段刪除仍然留在工作目錄、沒有 commit。修改前的備份在 `~/.claude/ops/backup-20260914/stage6/`。免費額度的 dashboard 查看位置沒有實際點過（寫成「Workers & Pages → live-quiz 的用量頁」並註明可能改版）。

**搶答系統常用指令**（都在 `live-quiz/` 底下，Bash 要先修 PATH，見下方環境地雷）：
- 本機：`npx wrangler dev --port 8787`
- 部署：**由使用者在 PowerShell 執行**（Claude 的部署指令會被權限規則擋下）：在 live-quiz 資料夾執行 `npx wrangler deploy`
- 流程測試：`node tools/flow-test.mjs [網址]`（53 項；不帶參數時測本機）
- 題庫測試：`node tools/bank-test.mjs`（23 項，純 Node，不用開伺服器）
- 壓力測試：`node tools/loadtest.mjs [網址] [人數]`（預設 150 人、35 項檢查＋延遲量測；**不要在活動當天對正式網址跑**）
- 模擬玩家：`node tools/bots.mjs [網址] [人數] [房間碼]`
- 正式環境即時紀錄：`npx wrangler tail live-quiz --format pretty`
- 退回階段 1：git tag `live-quiz-stage-1`

**環境地雷**：
- **Bash 的 PATH 是 Windows 格式**，會找不到 node、grep、ls。每個指令前面先執行 `export PATH="/usr/bin:/mingw64/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:/c/Program Files/GitHub CLI:/c/Users/user/AppData/Roaming/npm"`。
- 中文路徑下 **Glob 工具會失效**，改用 `ls` 或 Grep。
- 闖關遊戲：**本機不要 `npm run build`**（Node 24＋rollup 會當掉），Pages 由 GitHub Actions 打包；測試用 `npx vitest run`（197 個），**push 前一定要確認全綠**。
- 內建預覽窗格模擬 1920×1080 時截圖會縮得看不清楚：看主持人畫面改用 Chrome（claude-in-chrome）；同一個瀏覽器的主持人分頁與玩家分頁共用 localStorage，**測試時不要 `localStorage.clear()`**。
- Google 試算表貼資料：`navigator.clipboard.writeText` 只能在前景分頁、Chrome 視窗在最前面時使用；**不要用座標點儲存格**，改用網址 `#gid=0&range=A54` 跳過去，截圖確認名稱方塊後再貼上。
- 主線模型是 Opus 時照使用者全域規則「親自做」，只在需要大量平行或大量讀檔時才派 subagent；派工時禁止二度轉包。
- 專案根目錄的 `CLAUDE.md` 有一處不是 Claude 改的修改（應該是使用者的 CLAUDE.md 維護工具），**不要動它、也不要把它加進 commit**。

**等使用者提供**：搶答題的題目與圖片、各關獎勵內容、院徽的正式高解析檔與使用同意。

## 一句話現況（闖關猜謎，2026-09-13 的紀錄）
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
- **2026-09-14 搶答系統階段 2 完成並部署**（使用者同意在實機測試階段 1 前先做；階段 1 已打 git tag `live-quiz-stage-1` 可退回）。加入 QR code（`public/shared/qrcode.mjs`，qrcode-generator 2.0.4，MIT）、完整答題流程（開始 → 出題 → DO alarm 倒數 → 作答 → 結算 → 下一題 → 結束）、伺服器計時計分（`src/scoring.js`）、只採計第一次作答、全員答完提前結算、前 10 名＋前 3 名 4 位數驗證碼、出題中重連。**測試**：`node tools/flow-test.mjs [網址]`（32 項；不帶參數測本機 127.0.0.1:8787）。踩過的坑：CSS 的 `.stack{display:flex}` 會蓋過 `[hidden]`，已在 style.css 最前面加 `[hidden]{display:none!important}`。仍然是陽春介面（階段 3 美化）；尚未實作：踢人、主持人斷線恢復的完整測試、壓力測試（階段 4）、試算表題庫與圖片題（階段 5）。**真實手機＋行動網路尚未測試**。（2026-09-14 更新：使用者已用電腦＋手機實測階段 1、2，沒有問題）
- **2026-09-14 搶答系統階段 3 完成並部署（視覺設計）**：樣式拆成 `public/style.css`（院徽色系 tokens、按鈕、動畫、`prefers-reduced-motion`）、`host.css`（投影幕）、`play.css`（手機）；院徽圖 `public/brand/emblem.jpg`。主持人：標題列加院徽與官方英文名、放大的 QR 與房間碼、人數跳動、暱稱牆（只新增不重畫，新名字才有彈出動畫）、題目進度點、conic-gradient 圓環倒數（剩 5 秒轉紅脈動）、已作答進度條、答案揭曉長條依序長出、正確答案金框、前 5 名滑入＋分數跳動＋「▲ 上升／新進榜」、頒獎台依第 3→2→1 名升起＋彩帶。手機：大色塊佔滿畫面、送出後顯示所選色塊（支援的手機會震動）、結果整頁綠／紅／灰、前 3 名金色驗證碼卡。**字型不內嵌**（Noto 700＋900 兩個粗細就有 7–9 MB、800 多個檔），改用各平台內建中文字型。新增 `tools/bots.mjs`（模擬 N 位玩家自動作答；房間資訊寫到 `tools/.last-room.json`，已加入 .gitignore）。已在 Chrome 1530×784 與手機尺寸逐畫面截圖確認。
- **2026-09-14 搶答系統階段 4 紀錄（韌性，已部署，版本 94ddea51）**：
  - **踢人**：主持人送 `kick {playerId}`（只接受主持人）。伺服器把 `players.kicked` 設為 1，被踢者收到 `kicked` 後連線以 4403 關閉（前端不重連），之後帶同一個 playerId 回來也會被擋；主持人收到 `kick_done`。作答人數、作答分布、排名都排除被踢的人（`answeredCount` 與分布查詢改成 JOIN players）。出題中踢人會重新檢查「全員答完」；答案揭曉時踢人會更新 `lastResult`，並送 `leaderboard_update` 給主持人。遊戲結束後不能踢（`GAME_ENDED`）。主持人介面：點暱稱牆的名字，或標題列的「玩家名單」（可搜尋，出題中也能用）→ 確認對話框（預設焦點在「取消」）。手機顯示「你已被主持人移出房間」專屬畫面。
  - **提前結算判斷修正**：原本用「已答人數 ≥ 在線人數」，答完就離線的人會讓它誤判；改成 `endIfAllAnswered()`，判斷「在線但還沒答的人是否為 0」。
  - **主持人斷線恢復**：重連時伺服器補送的結算帶 `restored: true`，前端不顯示「新進榜／▲」、不播分數動畫。新增「複製接手連結」按鈕，連結是 `host.html#takeover=房間碼.主持人驗證碼`（路徑沿用目前網址，wrangler 會把 /host.html 轉成 /host），只複製到剪貼簿、不顯示在投影畫面上；開啟後會存進 localStorage，並清掉網址列。最終排名畫面加上「建立新房間」。
  - **連線韌性**（`public/shared/ws-client.js`，主持人與玩家共用）：ping 送出 8 秒沒收到 pong 就換新連線（處理手機鎖屏造成的假死連線）；`online` 事件與畫面回到前景時立即重連或先 ping 檢查；被換掉的舊連線晚到的事件一律忽略。
  - **效能**：`endGame` 的排名只算一次再發給每個人。150 人時最終排名從 139 ms 降到 59 ms。
  - **測試**：`node tools/flow-test.mjs` 從 32 項增加到 **42 項**（踢人、主持人恢復、錯誤驗證碼）；新增 `node tools/loadtest.mjs [網址] [人數]`（35 項檢查＋延遲量測，本機 150 人全部通過，報告在 `docs/搶答系統-壓力測試報告.md`）。主持人畫面的踢人、玩家名單搜尋、重新整理後恢復、接手連結，都已用內建瀏覽器以 DOM 檢查確認（視窗被隱藏時截圖會逾時，所以沒有截圖）。
  - **部署與正式環境測試**：由使用者部署，正式環境 150 人 35／35 通過。注意：Claude 在這台電腦執行 `wrangler deploy` 會被權限規則擋下，要請使用者自己跑；使用者的 PowerShell 可以直接用 npx，不需要修 PATH。
  - **未完成**：真實手機鎖屏與切換網路的測試。修改前的檔案備份在 `~/.claude/ops/backup-20260914/live-quiz-stage4/`。
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
