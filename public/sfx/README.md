# 音效替換機制（public/sfx/）

`src/audio/SoundManager.ts` 預設用 Web Audio API **即時合成**全部遊戲音效，
不需要任何音檔就能運作。如果你想換成真的錄音／音樂素材，把對應檔名的
`.mp3` 放進這個資料夾即可，程式會在 `preloadOverrides()` 時自動偵測、
抓得到就優先播放該檔案，抓不到（沒放檔案 / 404）就自動退回合成音，
不會讓遊戲因為缺檔而壞掉。

## 可替換的檔名清單（共 15 個，對應 SoundManager 的事件名稱）

| 檔名 | 對應事件 | 設計方向 |
|---|---|---|
| `intro.mp3` | `intro` | 開場，上行琶音＋和弦，約 2.5 秒 |
| `pickCategory.mp3` | `pickCategory` | 選題型，輕快的「叮」 |
| `questionShow.mp3` | `questionShow` | 題目出現，兩音的「登登」 |
| `tick.mp3` | `tick` | 倒數每秒的輕微滴答 |
| `tickUrgent.mp3` | `tickUrgent` | 最後 10 秒，音高較高、較急的滴答 |
| `countdownBed.mp3` | `countdownBed` | 倒數背景音樂（loop），有節奏的低鳴 |
| `lifeline.mp3` | `lifeline` | 使用提示卡，魔法感的上滑音 |
| `lock.mp3` | `lock` | 鎖定答案，厚實的一聲 |
| `suspense.mp3` | `suspense` | 揭曉前的懸疑，漸強的鼓滾／顫音，約 2–3 秒 |
| `correct.mp3` | `correct` | 答對，明亮的大三和弦＋閃爍感 |
| `wrong.mp3` | `wrong` | 答錯，下行的「嗚嗚」，好笑不恐怖 |
| `explanation.mp3` | `explanation` | 翻開詳解卡，紙張感的輕柔音 |
| `levelUp.mp3` | `levelUp` | 過關，短號角 |
| `champion.mp3` | `champion` | 全破，約 4 秒的慶祝樂句 |
| `timeUp.mp3` | `timeUp` | 時間到，蜂鳴 |

放檔案時請直接用上表的檔名，放在這個 `public/sfx/` 資料夾下（不用子資料夾），
例如 `public/sfx/correct.mp3`。

**注意**：`countdownBed` 目前的 loop 播放（`startBed()`/`stopBed()`）在程式裡是用
即時合成的節拍實作，即使放了 `countdownBed.mp3`，也只有直接呼叫
`play("countdownBed")`（單次播放）時會優先用該音檔；loop 背景音仍會用合成節拍，
這是目前版本的已知限制。

## 授權注意事項（非常重要，請務必遵守）

- **只能放 CC0（公共領域／無需授權）或明確允許商用的素材**。這個遊戲會在
  現場活動播放，不是私人使用，版權風險要在放檔案之前就排除，不要事後補救。
- 常見合法來源：
  - [Freesound.org](https://freesound.org/)（篩選授權為 CC0）
  - [Pixabay Sound Effects](https://pixabay.com/sound-effects/)（Pixabay 授權，多數可商用）
  - [OpenGameArt.org](https://opengameart.org/)（篩選 CC0）
- 不確定授權條款是否允許商用／現場活動播放時，**不要放進這個資料夾**，
  寧可繼續用合成音。
- **每一個放進來的音檔，都要在專案根目錄的 `LICENSES.md` 補上一筆記錄**
  （來源網址、授權條款、下載日期），否則之後很難追溯這個檔案能不能用、
  能不能繼續公開發布這個專案。
- 這個資料夾目前預設是空的（只有這份 README），代表目前全部音效都是合成音，
  沒有任何授權疑慮。
