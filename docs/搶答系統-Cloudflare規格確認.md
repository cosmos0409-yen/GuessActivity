# 全場搶答系統（Cloudflare 版）— 實作前確認文件

> 依據：使用者 2026-09-14 提供的「類 Kahoot 即時答題系統 — 開發規格」。
> 規格要求：**先不寫任何程式碼**，先列出檔案結構、訊息協定與實作順序，確認後才開工。
> 這份文件取代 `docs/搶答系統計畫.md` 的 Supabase 架構（該檔保留作歷史紀錄）。

---

## ✅ 使用者裁決（2026-09-14）
- C1：手機顯示**色塊加上選項文字**（`question_start` 會帶 `choices`，但不帶題目本文）
- C2：**兩種都支援，也支援圖片題**（預設讀 `src/questions.js`，也可以讀試算表「搶答題」分頁；圖片放在 `public/img/`）
- C3：保留前 10 名排名，加上前 3 名頒獎台與驗證碼
- 專案位置：**同一個 repo 的 `live-quiz/` 子資料夾**
- T1–T4：**全部採用**

## 一、需要使用者裁決的衝突與修正（已經裁決，保留原始分析）

### 衝突（規格和前幾輪的決定不同，要請使用者選擇）
| # | 規格書 | 前幾輪的決定 | Claude 建議 |
|---|---|---|---|
| C1 | 手機**只顯示 4 個色塊**，題目文字看投影幕 | 色塊**加上選項文字** | 看使用者裁決。要顯示選項文字的話，`question_start` 會多帶 4 個短字串（每則大約 100 bytes，對頻寬沒有影響），但**不帶題目本文** |
| C2 | 題庫是 repo 裡的 `questions.json`，沒有圖片題 | Google 試算表「搶答題」分頁，並且有圖片題 | 建議**兩種都支援**：預設讀 `questions.js`；主持人建立房間時，也可以選擇讀取試算表 CSV（由主持人瀏覽器讀取後，上傳給 DO）。圖片放在 `public/img/`，題目加一個 `image` 欄位 |
| C3 | 最終排名前 10 | 要選出**前 3 名**進闖關 | 保留前 10 名；另外加上**前 3 名頒獎台**，得獎者手機顯示「第 N 名＋4 位數驗證碼」，上台時由主持人核對 |

### 技術修正（Claude 認為不改會出問題，請使用者知悉）
| # | 規格書原文 | 問題 | 修正 |
|---|---|---|---|
| T1 | 題目全部預先載到前端，`questions.json` 裡有 `correct` 欄位 | Static Assets 是公開檔案，任何人都能開 `/questions.json` **直接看到正確答案** | 題庫改放在 **Worker 程式碼裡的 `src/questions.js`**，不放在 public。主持人加入時，由伺服器把題目（含正解）只傳給主持人；玩家端不需要題目本文 |
| T2 | 分數全程存在 DO 的記憶體變數，每題結束才寫一次 SQLite | 使用 **Hibernation API** 時，DO 閒置約 10 秒就可能被移出記憶體，記憶體變數會全部消失（等待室裡最容易發生），會造成玩家名單或分數消失 | 玩家**加入時**就寫入 SQLite（150 筆，成本可以忽略）；作答寫入記憶體，**同時**寫入 SQLite 的作答表（10 題 × 150 人 ＝ 1,500 筆，是 DO 本機的 SQLite，非常便宜）；每題結束再寫排行榜快照。DO 醒來時從 SQLite 還原狀態。每條 WebSocket 用 `serializeAttachment` 記下 playerId |
| T3 | `join` 沒有主持人驗證 | 任何人都能用 `role:"host"` 加入並按「下一題」 | 建立房間時產生 `hostToken`，主持人的 `join` 必須附上它；`start`、`next` 只接受主持人的連線 |
| T4 | `lobby_update` 帶完整玩家名單 | 150 人陸續加入時，如果每次都廣播完整名單給全場，會產生約 150×150 ＝ 2.2 萬則訊息 | **完整名單只傳給主持人**；玩家只收到人數，而且最多每秒更新一次 |

---

## 二、檔案結構（新資料夾，放在哪裡請使用者決定）
```
live-quiz/
├── wrangler.jsonc          # name、main、compatibility_date、assets、DO binding、
│                           # migrations: [{ tag:"v1", new_sqlite_classes:["GameRoom"] }]
├── package.json            # 只有 wrangler 一個 devDependency（沒有任何框架或打包工具）
├── src/
│   ├── worker.js           # 入口：POST /api/rooms 建立房間；GET /ws?room=XXXXXX 轉交給對應的 DO
│   ├── game-room.js        # Durable Object：狀態機、Hibernation handlers、計分、SQLite 快照與還原、alarm 計時
│   ├── questions.js        # 題庫（含正解，只存在伺服器端）— 先放 5 題假資料
│   └── protocol.js         # 訊息 type 常數與驗證（伺服器端）
├── public/                 # Workers Static Assets
│   ├── index.html          # 首頁：「我是主持人」／「我要加入」
│   ├── host.html  host.js  host.css      # 主持人投影畫面
│   ├── play.html  play.js  play.css      # 參加者手機畫面
│   ├── shared/
│   │   ├── time-sync.js    # 時間校準（serverNow 與本地時間的差值）與倒數計算
│   │   ├── ws-client.js    # 連線、自動重連（指數退避）、playerId 存 localStorage
│   │   └── qrcode.js       # 純前端 QR 產生器（把 MIT 授權的函式庫原始碼放進專案，不用 CDN）
│   ├── brand/emblem.jpg    # 院徽（沿用闖關遊戲的佔位圖）
│   └── img/                # 圖片題的圖片
├── tools/
│   └── loadtest.mjs        # 模擬 150 個 WebSocket 同時加入並作答（階段四之後的壓力測試）
└── README.md               # 安裝 wrangler、wrangler dev、部署、替換題庫、查看免費額度
```

---

## 三、訊息協定（WebSocket JSON，每則都有 `type`）

### 客戶端 → 伺服器
| type | 誰送 | 內容 | 伺服器處理 |
|---|---|---|---|
| `join` | 主持人／玩家 | `{ role, roomCode, nickname?, playerId?, hostToken? }` | 主持人要驗證 hostToken；玩家帶 playerId 時找回原本的身分，沒帶就建立新玩家；暱稱去除前後空白，限 1–12 字，重複時自動加上編號 |
| `start` | 主持人 | `{}` | 等待室 → 第 1 題 |
| `answer` | 玩家 | `{ questionIndex, choice }` | 題號必須是目前的題目，而且在時限內（多給 500ms 網路寬限）；只採計第一次作答 |
| `next` | 主持人 | `{}` | 結算 → 下一題；最後一題之後 → 結束 |
| `end_question` | 主持人 | `{}` | 提前結束這一題（例如全場都答完了；也會自動觸發） |
| `kick` | 主持人 | `{ playerId }` | 移除不當暱稱 |
| `ping` | 全部 | — | 用 `setWebSocketAutoResponse` 自動回 `pong`，**不會喚醒 DO** |

### 伺服器 → 客戶端
| type | 送給誰 | 內容 |
|---|---|---|
| `joined` | 本人 | `{ playerId, role, serverNow, phase, questionIndex, totalQuestions, score?, rank? }`；主持人另外收到 `questions`（含正解）與 `hostToken` |
| `lobby_update` | 主持人收完整資料；玩家只收人數 | 主持人：`{ playerCount, players:[{playerId,nickname}] }`；玩家：`{ playerCount }`（每秒最多一次） |
| `question_start` | 全部 | `{ questionIndex, startedAt, timeLimit, serverNow, choices? }`（choices 看 C1 的裁決） |
| `answer_ack` | 本人 | `{ questionIndex, accepted }` |
| `answer_count` | **只給主持人** | `{ answered, total }`（每 250ms 最多一次） |
| `question_end` | 全部 | `{ questionIndex, correctChoice, distribution:[a,b,c,d], leaderboard:[前 5 名] }` |
| `your_result` | 每個玩家各自一則 | `{ correct, points, totalScore, rank }` |
| `game_end` | 全部 | `{ finalLeaderboard:[前 10 名] }`；前 3 名另外收到 `{ place, verifyCode }` |
| `kicked` | 被踢的人 | `{}` |
| `error` | 本人 | `{ code, message }`（例如房間不存在、題號錯誤、暱稱不合法） |

### 時間與計分
- 加入時記錄 `offset = serverNow − Date.now()`，剩餘秒數 ＝ `startedAt + timeLimit×1000 − (Date.now() + offset)`。
- 時間到由 **DO alarm** 觸發，時間設在 `startedAt + timeLimit + 500ms`；或是全部玩家都答完，就提前結算。
- 計分：`round(1000 × (1 − (responseTime / timeLimit) × 0.5))`，`responseTime` 以伺服器收到訊息的時間減去 `startedAt` 計算；答錯或沒作答 0 分。
- 同分排序：總分 → 答對題數 → 答對題目的作答時間總和（越少越前面）→ 加入順序。

---

## 四、實作順序（每個階段做完都停下來讓使用者測試）
| 階段 | 內容 | 需要使用者做的事 |
|---|---|---|
| **0 環境** | 修好本機 Node／npm 的 PATH（目前 Bash 找不到 node）；註冊 Cloudflare、執行 `npx wrangler login` | 註冊 Cloudflare 帳號，並在瀏覽器按同意授權（**要本人操作**） |
| **1 骨架** | wrangler 設定、Worker 路由、DO 建房、WebSocket 連線、兩個分頁互相看到對方加入；**部署到 workers.dev** | 用兩支手機或兩個分頁測試 |
| **2 流程** | 開始 → 出題 → 倒數 → 作答 → 結算 → 下一題 → 結束；計分；SQLite 快照與還原（T2） | 找 3–5 人實際玩一場 |
| **3 視覺** | 院徽色系、主持人投影版面、手機大色塊（形狀＋顏色＋文字，照顧色弱觀眾）、QR、分布長條圖、排行榜動畫、前 3 名頒獎台 | 看畫面、給意見 |
| **4 韌性** | 斷線重連、遲到加入、主持人斷線恢復、踢人；**150 人壓力測試**（loadtest.mjs） | 看壓力測試報告 |
| **5 題庫** | 試算表「搶答題」分頁匯入（C2）、圖片題 | 提供 10 題與圖片 |
| **6 文件** | README（依規格第 10 點）、`doc/handover.md`、`CLAUDE.md` 更新 | — |

---

## 五、免費額度（2026-09-14 已查證，來源：developers.cloudflare.com 的 workers／durable-objects pricing 頁，完整報告在 scratchpad `cloudflare-limits.md`）
| 項目 | 免費上限 | 一場（150 人 × 10 題）估計 |
|---|---|---|
| DO 請求 | 100,000 次／天（收到的 WebSocket 訊息以 20:1 換算，送出免費） | 約 225 次 |
| DO 執行時間 | 13,000 GB-s／天（hibernation 閒置不計） | 約 25 GB-s |
| SQLite 寫入 | 100,000 列／天 | 約 1,500 列（T2 每筆作答都寫）→ **一天最多約 60–70 場**，活動只需要 1–2 場，足夠 |
| SQLite 讀取 | 500 萬列／天 | 很少 |
| ping/pong | `setWebSocketAutoResponse` 不喚醒 DO、不計費 | — |
| Static Assets | 每個版本 20,000 個檔案、單檔 25 MiB，請求免費 | — |
- 超過額度會**直接報錯**（不是限流），每天 00:00 UTC（台灣時間 08:00）重置。
- Hibernation：閒置 10 秒會進入休眠，70–140 秒後會被移出記憶體；alarm 可以喚醒 DO（會重新執行 constructor）；`serializeAttachment` 上限 16 KB。
- SQLite-backed DO 在免費方案可以使用；migration 寫成 `new_classes` 會部署失敗（錯誤碼 10097）。wrangler 目前是 v4。

（以下為原本的估算，保留作為對照）
- 一場 150 人 × 10 題：大約是加入 150 次、作答 1,500 次、廣播約 3,000 則，加上 alarm 10 次。量級遠低於 Workers 與 DO 免費方案的每日上限；確切數字與「WebSocket 訊息如何計算請求數」的規則，會在實作前查證後補在這裡。
- SQLite-backed DO 可以在免費方案使用，而且 migration 要用 `new_sqlite_classes`：這是規格書的說法，階段 0 會用官方文件再確認一次。
