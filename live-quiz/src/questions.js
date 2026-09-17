// 測試題庫（主持人頁的「測試題庫（彩排用）」）：彩排時用這裡的題目，正式題目才不會在彩排時外流。
// 題庫（含正確答案）只放在伺服器端，不放在 public/，觀眾無法讀到答案（規格確認文件 T1）。
// 刻意涵蓋正式題會出現的版面：20／25／30 秒、長選項、圖片題（public/img/sample.svg）。
// 格式：{ text, choices: [2–4 個字串], correct: 選項索引, timeLimit: 秒數, image?: "/img/檔名" }
// correct 是 choices 的索引（0 = 紅▲、1 = 藍◆、2 = 黃●、3 = 綠■）。
export const QUESTIONS = [
  { text: "（測試）台灣最高的山是？", choices: ["雪山", "玉山", "合歡山", "阿里山"], correct: 1, timeLimit: 20 },
  { text: "（測試）1 公里等於幾公尺？", choices: ["100", "10000", "1000", "500"], correct: 2, timeLimit: 20 },
  { text: "（測試）彩虹通常有幾種顏色？", choices: ["5", "6", "8", "7"], correct: 3, timeLimit: 25 },
  {
    text: "（測試）下列關於水的敘述，何者錯誤？",
    choices: [
      "純水在一大氣壓下的沸點約為攝氏100度",
      "水的化學式是H2O",
      "冰的密度比液態水大，所以冰塊會沉入水中",
      "水在攝氏4度左右時密度最大",
    ],
    correct: 2,
    timeLimit: 30,
  },
  {
    text: "（測試）圖片題：下圖中間的金色圖案，最像下列哪一個物品？",
    choices: ["天平", "時鐘", "雨傘", "書本"],
    correct: 0,
    timeLimit: 20,
    image: "/img/sample.svg",
  },
];
