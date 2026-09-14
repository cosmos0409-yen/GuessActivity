// 題庫讀取、驗證與快取。
//
// 讀取順序：
//   1. 設定裡的 Google 試算表 CSV 網址（存在 localStorage）→ fetch（8 秒逾時）
//   2. 成功 → 寫入 localStorage 快取（記錄時間），回傳來源標記 "remote"
//   3. 失敗（沒設定網址、fetch 失敗、逾時、內容解析後完全沒有合格資料）
//      → 讀 localStorage 快取，回傳來源標記 "cache"
//   4. 快取也沒有 → 讀內建的 /sample-questions.csv 與 /sample-categories.csv，
//      回傳來源標記 "bundled"

import { parseCsvRecords } from "./csv";
import { assetUrl } from "../utils/baseUrl";
import type {
  BankSource,
  Category,
  Domain,
  OptionKey,
  Question,
  QuestionBank,
  QuestionStatus,
  QuestionWarning,
} from "./types";

const FETCH_TIMEOUT_MS = 8000;

export const STORAGE_KEYS = {
  questionsUrl: "quiz.settings.questionsCsvUrl",
  categoriesUrl: "quiz.settings.categoriesCsvUrl",
  cachedQuestionsCsv: "quiz.cache.questionsCsv",
  cachedCategoriesCsv: "quiz.cache.categoriesCsv",
  cachedFetchedAt: "quiz.cache.fetchedAt",
} as const;

// 正式題庫（「法官學院測驗表」發布成 CSV）直接寫在程式裡（使用者 2026-09-14 同意）：
// 換任何一台電腦打開都能直接讀到，設定頁填的網址仍然優先。
export const DEFAULT_REMOTE_URLS = {
  questionsUrl:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDMOTLgvahrEnSwzReVTj9CEbwKDgXjrAZ3Tu7h8mFLWTJlQr4gwfTOJjwLfSgFjbEhEeUxunp3viH/pub?gid=0&single=true&output=csv",
  categoriesUrl:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDMOTLgvahrEnSwzReVTj9CEbwKDgXjrAZ3Tu7h8mFLWTJlQr4gwfTOJjwLfSgFjbEhEeUxunp3viH/pub?gid=471665721&single=true&output=csv",
} as const;

const BUNDLED_QUESTIONS_URL = assetUrl("sample-questions.csv");
const BUNDLED_CATEGORIES_URL = assetUrl("sample-categories.csv");

const VALID_DOMAINS: Domain[] = ["法律", "知識"];
const VALID_OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const VALID_STATUSES: QuestionStatus[] = ["上架", "待審"];

// ---------------------------------------------------------------------------
// localStorage 安全存取（在沒有 localStorage 的環境下不要炸掉，例如 SSR 或測試）
// ---------------------------------------------------------------------------

function safeGetItem(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // 忽略（例如私密模式或容量已滿）
  }
}

// ---------------------------------------------------------------------------
// 題型 CSV 解析：名稱,領域,圖示,顏色,啟用
// ---------------------------------------------------------------------------

export function parseCategoriesCsv(csvText: string): { categories: Category[]; warnings: QuestionWarning[] } {
  const records = parseCsvRecords(csvText);
  const categories: Category[] = [];
  const warnings: QuestionWarning[] = [];

  for (const { row, fields } of records) {
    const name = (fields["名稱"] ?? "").trim();
    const domainRaw = (fields["領域"] ?? "").trim();
    const icon = (fields["圖示"] ?? "").trim();
    const color = (fields["顏色"] ?? "").trim();
    const enabledRaw = (fields["啟用"] ?? "").trim();

    if (!name) {
      warnings.push({ row, reason: "缺少「名稱」" });
      continue;
    }
    if (!VALID_DOMAINS.includes(domainRaw as Domain)) {
      warnings.push({ row, reason: `「領域」不合法：${domainRaw || "(空白)"}` });
      continue;
    }
    // 啟用：是/否，空白視為是
    const enabled = enabledRaw === "" ? true : enabledRaw === "是" ? true : enabledRaw === "否" ? false : null;
    if (enabled === null) {
      warnings.push({ row, reason: `「啟用」不合法：${enabledRaw}` });
      continue;
    }

    categories.push({
      name,
      domain: domainRaw as Domain,
      icon,
      color,
      enabled,
    });
  }

  return { categories, warnings };
}

// ---------------------------------------------------------------------------
// 題目 CSV 解析：
// id,領域,題型,難度,題目,圖片網址,A,B,C,D,正解,刪除選項優先,結論,詳解,冷知識,主持人口白,出處,狀態
// ---------------------------------------------------------------------------

export function parseQuestionsCsv(csvText: string): { questions: Question[]; warnings: QuestionWarning[] } {
  const records = parseCsvRecords(csvText);
  const questions: Question[] = [];
  const warnings: QuestionWarning[] = [];
  const seenIds = new Set<string>();

  for (const { row, fields } of records) {
    const id = (fields["id"] ?? "").trim();
    if (!id) {
      warnings.push({ row, reason: "缺少「id」" });
      continue;
    }
    if (seenIds.has(id)) {
      warnings.push({ row, reason: `「id」重複：${id}` });
      continue;
    }

    const domainRaw = (fields["領域"] ?? "").trim();
    if (!VALID_DOMAINS.includes(domainRaw as Domain)) {
      warnings.push({ row, reason: `「領域」不合法：${domainRaw || "(空白)"}` });
      continue;
    }

    const categoryName = (fields["題型"] ?? "").trim();
    if (!categoryName) {
      warnings.push({ row, reason: "缺少「題型」" });
      continue;
    }

    const difficultyRaw = (fields["難度"] ?? "").trim();
    const difficulty = Number(difficultyRaw);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      warnings.push({ row, reason: `「難度」不合法：${difficultyRaw || "(空白)"}` });
      continue;
    }

    const text = (fields["題目"] ?? "").trim();
    if (!text) {
      warnings.push({ row, reason: "缺少「題目」" });
      continue;
    }

    const imageUrl = (fields["圖片網址"] ?? "").trim();

    const optionA = (fields["A"] ?? "").trim();
    const optionB = (fields["B"] ?? "").trim();
    const optionC = (fields["C"] ?? "").trim();
    const optionD = (fields["D"] ?? "").trim();
    if (!optionA || !optionB || !optionC || !optionD) {
      warnings.push({ row, reason: "選項 A/B/C/D 有缺漏" });
      continue;
    }

    const correctRaw = (fields["正解"] ?? "").trim().toUpperCase();
    if (!VALID_OPTION_KEYS.includes(correctRaw as OptionKey)) {
      warnings.push({ row, reason: `「正解」不合法：${correctRaw || "(空白)"}` });
      continue;
    }
    const correct = correctRaw as OptionKey;

    const removalPriorityRaw = (fields["刪除選項優先"] ?? "").trim().toUpperCase();
    let removalPriority: OptionKey | undefined;
    if (removalPriorityRaw !== "") {
      if (!VALID_OPTION_KEYS.includes(removalPriorityRaw as OptionKey)) {
        warnings.push({ row, reason: `「刪除選項優先」不合法：${removalPriorityRaw}` });
        continue;
      }
      if (removalPriorityRaw === correct) {
        warnings.push({ row, reason: "「刪除選項優先」不可以等於「正解」" });
        continue;
      }
      removalPriority = removalPriorityRaw as OptionKey;
    }

    const conclusion = (fields["結論"] ?? "").trim();

    const explanation = (fields["詳解"] ?? "").trim();
    if (!explanation) {
      warnings.push({ row, reason: "缺少「詳解」" });
      continue;
    }

    const funFact = (fields["冷知識"] ?? "").trim();
    const hostNotes = (fields["主持人口白"] ?? "").trim();
    const source = (fields["出處"] ?? "").trim();

    const statusRaw = (fields["狀態"] ?? "").trim();
    const status: QuestionStatus | null = statusRaw === "" ? "上架" : VALID_STATUSES.includes(statusRaw as QuestionStatus) ? (statusRaw as QuestionStatus) : null;
    if (status === null) {
      warnings.push({ row, reason: `「狀態」不合法：${statusRaw}` });
      continue;
    }

    seenIds.add(id);
    questions.push({
      id,
      categoryName,
      domain: domainRaw as Domain,
      difficulty,
      text,
      imageUrl: imageUrl || undefined,
      options: { A: optionA, B: optionB, C: optionC, D: optionD },
      correct,
      removalPriority,
      conclusion: conclusion || undefined,
      explanation,
      funFact: funFact || undefined,
      hostNotes: hostNotes || undefined,
      source: source || undefined,
      status,
    });
  }

  return { questions, warnings };
}

// ---------------------------------------------------------------------------
// fetch（帶逾時）
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 主要讀取流程
// ---------------------------------------------------------------------------

function buildBank(
  questionsCsv: string,
  categoriesCsv: string,
  source: BankSource,
  fetchedAt: string,
): QuestionBank {
  const { questions, warnings: qWarnings } = parseQuestionsCsv(questionsCsv);
  const { categories, warnings: cWarnings } = parseCategoriesCsv(categoriesCsv);
  return {
    questions,
    categories,
    source,
    fetchedAt,
    warnings: [...qWarnings, ...cWarnings],
  };
}

export interface LoadQuestionBankOptions {
  /** 提供給測試用：注入 fetch 逾時毫秒數 */
  timeoutMs?: number;
}

export async function loadQuestionBank(options: LoadQuestionBankOptions = {}): Promise<QuestionBank> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const { questionsUrl, categoriesUrl } = getRemoteUrls();

  // 1. 嘗試遠端
  if (questionsUrl && categoriesUrl) {
    try {
      const [questionsCsv, categoriesCsv] = await Promise.all([
        fetchWithTimeout(questionsUrl, timeoutMs),
        fetchWithTimeout(categoriesUrl, timeoutMs),
      ]);
      const fetchedAt = new Date().toISOString();
      safeSetItem(STORAGE_KEYS.cachedQuestionsCsv, questionsCsv);
      safeSetItem(STORAGE_KEYS.cachedCategoriesCsv, categoriesCsv);
      safeSetItem(STORAGE_KEYS.cachedFetchedAt, fetchedAt);
      return buildBank(questionsCsv, categoriesCsv, "remote", fetchedAt);
    } catch {
      // 失敗就往下走快取
    }
  }

  // 2. 嘗試本機快取
  const cachedQuestionsCsv = safeGetItem(STORAGE_KEYS.cachedQuestionsCsv);
  const cachedCategoriesCsv = safeGetItem(STORAGE_KEYS.cachedCategoriesCsv);
  const cachedFetchedAt = safeGetItem(STORAGE_KEYS.cachedFetchedAt);
  if (cachedQuestionsCsv && cachedCategoriesCsv) {
    return buildBank(cachedQuestionsCsv, cachedCategoriesCsv, "cache", cachedFetchedAt ?? new Date().toISOString());
  }

  // 3. 內建範例題庫
  const [bundledQuestionsCsv, bundledCategoriesCsv] = await Promise.all([
    fetchWithTimeout(BUNDLED_QUESTIONS_URL, timeoutMs),
    fetchWithTimeout(BUNDLED_CATEGORIES_URL, timeoutMs),
  ]);
  return buildBank(bundledQuestionsCsv, bundledCategoriesCsv, "bundled", new Date().toISOString());
}

// ---------------------------------------------------------------------------
// 設定：讀寫遠端 CSV 網址
// ---------------------------------------------------------------------------

export function setRemoteUrls(questionsUrl: string, categoriesUrl: string): void {
  safeSetItem(STORAGE_KEYS.questionsUrl, questionsUrl);
  safeSetItem(STORAGE_KEYS.categoriesUrl, categoriesUrl);
}

/** 設定頁填過的網址優先；沒填過（或是空白）就用內建的正式題庫網址 */
export function getRemoteUrls(): { questionsUrl: string; categoriesUrl: string } {
  return {
    questionsUrl: safeGetItem(STORAGE_KEYS.questionsUrl) || DEFAULT_REMOTE_URLS.questionsUrl,
    categoriesUrl: safeGetItem(STORAGE_KEYS.categoriesUrl) || DEFAULT_REMOTE_URLS.categoriesUrl,
  };
}
