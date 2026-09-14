// 題庫測試（純 Node，不需要啟動伺服器）：試算表 CSV 解析＋伺服器端驗證。
// 用法（在 live-quiz/ 底下）：node tools/bank-test.mjs
import { readFileSync } from "node:fs";
import { parseCsv, parseQuestionCsv } from "../public/shared/question-csv.js";
import { validateQuestions, isValidImage } from "../src/question-bank.js";
import { QUESTIONS } from "../src/questions.js";

let failed = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) failed++;
};

// ---------- CSV 基本解析 ----------
const tricky = '﻿題目,A\r\n"有逗號, 也有""引號""","第一行\n第二行"\r\n\r\n';
const rows = parseCsv(tricky);
ok(rows.length === 2 && rows[1][0] === '有逗號, 也有"引號"' && rows[1][1] === "第一行\n第二行", "CSV：BOM、引號、逗號、欄位內換行、空白列");

// ---------- 搶答題分頁 ----------
const header = "題目,圖片網址,A,B,C,D,正解,秒數,狀態";
const csv = [
  header,
  "四選一的題目,,甲,乙,丙,丁,c,,",
  "二選一的題目,,是,否,,,B,10,上架",
  "三選一附圖,sample.svg,一,二,三,,a,30,",
  "網路圖片,https://example.com/x.png,一,二,,,A,,",
  "待審的題目,,一,二,,,A,,待審",
  ",,一,二,,,A,,",
  "跳著填選項,,一,二,,四,A,,",
  "正解指到空選項,,一,二,,,C,,",
  "秒數不合法,,一,二,,,A,3,",
  "http 圖片,http://example.com/x.png,一,二,,,A,,",
  "路徑穿越,../secret.png,一,二,,,A,,",
  "狀態不合法,,一,二,,,A,,下架",
].join("\n");
const { questions, warnings } = parseQuestionCsv(csv);
ok(questions.length === 4, `合格的題目 4 題（實際 ${questions.length}）`);
ok(questions[0].correct === 2 && questions[0].choices.length === 4 && questions[0].timeLimit === 20, "四選一：正解小寫 c → 索引 2，秒數預設 20");
ok(questions[1].choices.length === 2 && questions[1].correct === 1 && questions[1].timeLimit === 10, "二選一：C、D 留空，秒數 10");
ok(questions[2].choices.length === 3 && questions[2].image === "/img/sample.svg", "三選一：檔名轉成 /img/sample.svg");
ok(questions[3].image === "https://example.com/x.png", "https 圖片網址原樣保留");
ok(!questions.some((q) => q.text === "待審的題目") && !warnings.some((w) => w.row === 6), "「待審」直接跳過、不算警告");
const reasons = Object.fromEntries(warnings.map((w) => [w.row, w.reason]));
ok(reasons[7]?.includes("缺少題目"), "第 7 列：缺少題目");
ok(reasons[8]?.includes("跳著填"), "第 8 列：選項跳著填");
ok(reasons[9]?.includes("正解"), "第 9 列：正解指到空白選項");
ok(reasons[10]?.includes("秒數"), "第 10 列：秒數不合法");
ok(reasons[11]?.includes("https"), "第 11 列：http 圖片被擋");
ok(reasons[12]?.includes("檔名"), "第 12 列：路徑穿越被擋");
ok(reasons[13]?.includes("狀態"), "第 13 列：狀態不合法");
ok(parseQuestionCsv("題目,A\n只有兩欄,x").warnings.some((w) => w.reason.includes("「B」")), "標題列缺欄位時直接回報");

// 解析結果一定要通過伺服器驗證（兩邊規則一致）
ok(validateQuestions(questions).errors.length === 0, "CSV 解析出的題目通過伺服器驗證");

// ---------- 伺服器驗證 ----------
ok(validateQuestions(QUESTIONS).errors.length === 0, "內建題庫通過驗證");
ok(validateQuestions([]).errors[0] === "題庫是空的", "空題庫被拒絕");
const tooMany = Array.from({ length: 51 }, () => ({ text: "q", choices: ["a", "b"], correct: 0 }));
ok(validateQuestions(tooMany).errors.some((e) => e.includes("最多 50 題")), "超過 50 題被拒絕");
const badOnes = [
  { text: "", choices: ["a", "b"], correct: 0 },
  { text: "q", choices: ["a"], correct: 0 },
  { text: "q", choices: ["a", "b"], correct: 2 },
  { text: "q", choices: ["a", "b"], correct: 0, timeLimit: 500 },
  { text: "q", choices: ["a", "b"], correct: 0, image: "javascript:alert(1)" },
  { text: "x".repeat(201), choices: ["a", "b"], correct: 0 },
];
ok(validateQuestions(badOnes).errors.length === badOnes.length, "6 種不合法的題目各回報一個錯誤");
ok(!isValidImage("/img/../secret") && !isValidImage("/img/a/b.png") && isValidImage("/img/圖1.jpg"), "圖片路徑：擋掉 .. 與子資料夾，允許中文檔名");
const cleaned = validateQuestions([{ text: " q ", choices: [" a ", "b"], correct: 0, extra: "不該保留" }]).questions[0];
ok(cleaned.text === "q" && cleaned.choices[0] === "a" && !("extra" in cleaned) && cleaned.timeLimit === 20, "驗證後只保留需要的欄位並去掉前後空白");

// ---------- 範本檔 ----------
const template = parseQuestionCsv(readFileSync(new URL("../../docs/搶答題範本.csv", import.meta.url), "utf8"));
ok(template.questions.length > 0 && template.warnings.length === 0, `docs/搶答題範本.csv 可以直接讀（${template.questions.length} 題、0 警告）`);

console.log(failed ? `\n${failed} 項失敗` : "\n全部通過");
process.exit(failed ? 1 : 0);
