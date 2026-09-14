// 題庫（含正確答案）只放在伺服器端，不放在 public/，觀眾無法讀到答案（規格確認文件 T1）。
// 階段 1 還用不到；階段 2 開始出題時使用。先放 5 題測試用的假資料。
// correct 是 choices 的索引（0 = 紅▲、1 = 藍◆、2 = 黃●、3 = 綠■）。
export const QUESTIONS = [
  { text: "（測試）台灣最高的山是？", choices: ["雪山", "玉山", "合歡山", "阿里山"], correct: 1, timeLimit: 20 },
  { text: "（測試）1 公里等於幾公尺？", choices: ["100", "10000", "1000", "500"], correct: 2, timeLimit: 20 },
  { text: "（測試）彩虹通常有幾種顏色？", choices: ["5", "6", "8", "7"], correct: 3, timeLimit: 20 },
  { text: "（測試）一年有幾個月？", choices: ["12", "10", "13", "11"], correct: 0, timeLimit: 20 },
  { text: "（測試）水的化學式是？", choices: ["CO2", "H2O", "O2", "NaCl"], correct: 1, timeLimit: 20 },
];
