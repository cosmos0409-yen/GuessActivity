# CLAUDE.md — 司法官學院 闖關猜謎 App

司法官學院活動用的現場闖關猜謎遊戲（Vite + React + TypeScript，單機執行，主持人操作、投影給觀眾看）。
另有獨立的**全場搶答系統** `live-quiz/`（原生 HTML/JS＋Cloudflare Workers＋SQLite Durable Objects，150 人手機搶答選出前 3 名），細節見 `live-quiz/README.md`。

## 常用指令

```
npm run dev          # 開發伺服器，日常開發與正式活動都用這個
npx vitest run        # 跑全部測試
npx tsc --noEmit       # 只做型別檢查，不輸出檔案
```

全場搶答（在 `live-quiz/` 底下）：

```
npx wrangler dev --port 8787            # 本機
node tools/bank-test.mjs                # 題庫解析與驗證（不需要伺服器）
node tools/flow-test.mjs [網址]          # 完整流程測試（不帶網址測本機）
node tools/loadtest.mjs [網址] [人數]    # 壓力測試，預設 150 人；活動當天不要對正式網址跑
```

**全場搶答的部署由使用者自己在 PowerShell 執行**：在 `live-quiz/` 執行 `powershell -ExecutionPolicy Bypass -File tools\deploy.ps1`（專案路徑含中文，直接 `npx wrangler deploy` 會當掉，見下方環境注意事項）。Claude 執行部署會被權限規則擋下。

**禁止執行 `npm run build`**：在目前環境的 Node 24 下，`vite build` 階段會卡死在
「39 modules transformed」（疑似 `@rollup/rollup-win32-x64-msvc` native binding 相容性問題，
錯誤碼 `STATUS_STACK_BUFFER_OVERRUN`）。日常開發與驗證一律用 `npm run dev` + `npx tsc --noEmit` +
`npx vitest run` 這三個指令，不要嘗試打包。詳情見 `doc/handover.md` 已知問題。

## 目錄結構

| 路徑 | 職責 |
|---|---|
| `src/data/` | 題庫型別、CSV 解析與驗證、抽題邏輯、本機快取／已用題目 |
| `src/state/gameMachine.ts` | 遊戲狀態機（純函式 reducer，不依賴 React／DOM） |
| `src/hooks/hotkeys.ts` | 快捷鍵對照表與判斷邏輯（純函式，唯一事實來源） |
| `src/hooks/useHotkeys.ts` | 把 `hotkeys.ts` 接到真的 DOM keydown 事件（無自動化測試） |
| `src/hooks/useCountdown.ts` | 倒數計時 hook |
| `src/app/` | localStorage 設定（規則／彩排）、場次紀錄、`configReducer`（把設定套進 `gameMachine` 的 `state.config`）、音效橋接 |
| `src/components/` | 各畫面 UI（大廳、選題、題目卡、提示卡、結算、設定頁、排行榜等） |
| `src/host/` | 主持人手卡（`hostcards.html` 獨立入口，適合列印） |
| `src/audio/` | 合成音效（`SoundManager`），`soundlab.html` 可單獨試聽 |
| `src/vote/` | 「全場一起協助」投票（表單網址、輪詢統計、QR code、備援手動輸入） |
| `gas/` | 投票用的 Google Apps Script（`Code.gs`、`parseChoice.gs`）與部署教學 |
| `docs/` | 給非工程師看的操作文件（題庫維護、使用者待辦清單） |
| `doc/handover.md` | 給下一個 Claude session 的完整交接手冊 |
| `live-quiz/` | 全場搶答系統（獨立程式）：`src/` 伺服器（Worker、Durable Object、題庫驗證）、`public/` 網頁、`tools/` 測試工具，說明見 `live-quiz/README.md` |

## 硬性約束

- 所有資源放在專案本機（字型、音效、圖片），**不使用 CDN**，因為活動現場網路不可靠。
- 「全場一起協助」投票**一定要有主持人手動輸入的備援**，連續 3 次讀不到票數就要能切換。
- **答案不能出現在觀眾看得到的網址或畫面上**（表單網址樣板只能帶題號，不能帶答案或選項內容）。
- **法律題必須附出處**（`出處` 欄位），且下筆或修改法律題前要用 `tw-legal-rag` 查證。
- **一旦使用任一張提示卡，這一題的倒數就永久結束**，不會再恢復計時（見 `gameMachine.ts` 的 lifeline 轉場）。
- 對象是**考過國家考試的學員**，題目與選項不能出得幼稚或太簡單。
- 美術／配色一律使用司法官學院院徽色系（見 `src/styles/tokens.css`），不要自行換成別的主題色。
- 全場搶答：**正解與題目本文只能傳給主持人**，玩家端的 WebSocket 訊息只能帶選項文字；題庫一律經過 `live-quiz/src/question-bank.js` 驗證。
- **投影畫面以 1366×768 為基準**（決賽全部畫面、選拔賽主持人頁）：每個階段的每一題都要完整顯示、不能捲動、按鈕在畫面內。放不下時自動縮字（決賽 `src/app/fitText.ts` 的 `--tpi-fit`、選拔賽 `live-quiz/public/host.js` 的 `--fit`），**字級下限：題目 28px、選項 22px**。選拔賽圖片題：直式（寬÷高 < 1.1）圖左字右、橫式圖在題目下方。改版面後要在 1366×768 實測。
- 選拔賽音效與決賽共用 `src/audio/SoundManager.ts`：`live-quiz/public/shared/sound.js` 是 `live-quiz/tools/build-sound.mjs` 產生的，**不要手改**，改完 SoundManager.ts 要重新產生。

## 環境注意事項

- 專案路徑含中文（`C:\猜謎程式`），**Glob 工具在中文路徑下會失效**，改用 `ls`（Bash）或 Grep 工具做檔案搜尋。
- **wrangler（4.131.1＋Node 24）在含中文的工作目錄會以 0xC0000409 當掉**、不顯示錯誤（像卡住）：部署用 `live-quiz/tools/deploy.ps1`；本機 `wrangler dev` 要把 `src`、`public`、`wrangler.jsonc`、`package.json` 複製到英文路徑再從那裡執行。
- 派 subagent 執行任務時，**禁止該 subagent 再二度轉包給別的 subagent**。

## 詳細內容

完整的階段狀態、已定案決策、已知問題與下一步，都在 `doc/handover.md`，改動前務必先讀那份。

<!-- BEGIN: claude-md-12-rules (managed block — do not edit or delete) -->
# CLAUDE.md — 12-rule template

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

## Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

## Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

## Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

## Rule 6 — Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

## Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

## Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.
<!-- END: claude-md-12-rules -->
