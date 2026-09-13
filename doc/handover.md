# 交接手冊 — 司法官學院 闖關猜謎 App

> 最後更新：2026-09-12
> 完整計畫：`C:\Users\user\.claude\plans\app-1-10-2-3-3-stateless-charm.md`（規則、美術、架構都以此為準）

## 一句話現況
Phase 1–6 全部完成：資料層、狀態機、投票模組、主畫面 UI、提示卡、合成音效、快捷鍵、設定頁、彩排模式、排行榜、主持人手卡都已就位，測試共 **170 個全綠**，`npx tsc --noEmit` 0 錯誤。Phase 9（README.md／docs/題庫維護說明.md／CLAUDE.md）已完成。**下一步是 Phase 8 實測**：`npm run dev` 用真的瀏覽器走場，以及 `npm run build` 在 Node 24 會當掉的問題仍待處理（見已知問題）。

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
- 設定頁改的「每題秒數／保底關／時間到政策／彩排模式」是透過 `src/app/configReducer.ts` 的本地 `SET_CONFIG` action 立即套用到 `state.config`（不需要重新整理頁面或開新的一場），因為 `gameMachine.ts`（禁止修改的檔案）本身沒有「更新設定」的 action。
- `LICENSES.md` 放在根目錄；依計畫應該放在 `public/sfx/LICENSES.md`，需要搬移。
- `@types/qrcode` 被裝在 dependencies，應該搬到 devDependencies（不影響功能）。
- 派工時要禁止 subagent 二度轉包（見記憶 no-subcontracting）。
- 需要主辦單位提供：院徽向量檔與使用同意、題庫審閱、保底關的獎勵內容。
