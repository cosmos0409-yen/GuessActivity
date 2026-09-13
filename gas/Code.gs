// 「全場一起協助」投票統計 — Apps Script Web App
//
// 只負責「讀取」表單回應試算表並統計票數，不會寫入任何資料。
// 部署與設定教學請看同目錄的 README.md。
//
// 依賴 parseChoice.gs 裡的 parseChoice() 函式（Apps Script 專案內的多個 .gs
// 檔案共用同一個全域範圍，不需要 import）。

// ↓↓↓ 主辦單位唯一需要確認的常數：表單回應分頁的名稱 ↓↓↓
var RESPONSES_SHEET_NAME = "表單回應 1";

// 表頭欄位名稱關鍵字（用來在表頭列裡「找」出題號欄與答案欄，不要求欄位順序固定）
var ROUND_HEADER_KEYWORD = "題號";
var ANSWER_HEADER_KEYWORD = "答案";

var CACHE_SECONDS = 1;
var CACHE_PREFIX = "vote_stats_";

/**
 * Web App 入口：GET /exec?round=場次-關卡-題號
 * 回傳 {round, counts:{A,B,C,D}, total, updatedAt}
 */
function doGet(e) {
  var round = e && e.parameter && e.parameter.round ? String(e.parameter.round).trim() : "";

  if (!round) {
    return jsonResponse({ error: "缺少 round 參數" });
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = CACHE_PREFIX + round;
  var cached = cache.get(cacheKey);
  if (cached) {
    return jsonResponse(JSON.parse(cached));
  }

  var result = computeStats(round);
  cache.put(cacheKey, JSON.stringify(result), CACHE_SECONDS);
  return jsonResponse(result);
}

/**
 * 讀取表單回應分頁，統計指定 round 的票數。
 * @param {string} round
 */
function computeStats(round) {
  var counts = { A: 0, B: 0, C: 0, D: 0 };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESPONSES_SHEET_NAME);

  if (!sheet) {
    return {
      round: round,
      counts: counts,
      total: 0,
      updatedAt: new Date().toISOString(),
      error: "找不到分頁：" + RESPONSES_SHEET_NAME,
    };
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { round: round, counts: counts, total: 0, updatedAt: new Date().toISOString() };
  }

  var header = values[0];
  var roundCol = findColumnIndex(header, ROUND_HEADER_KEYWORD);
  var answerCol = findColumnIndex(header, ANSWER_HEADER_KEYWORD);

  if (roundCol === -1 || answerCol === -1) {
    return {
      round: round,
      counts: counts,
      total: 0,
      updatedAt: new Date().toISOString(),
      error: "找不到表頭欄位（題號／答案）",
    };
  }

  var total = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowRound = row[roundCol] === undefined || row[roundCol] === null ? "" : String(row[roundCol]).trim();
    if (rowRound !== round) continue;

    var choice = parseChoice(row[answerCol]);
    if (choice && counts.hasOwnProperty(choice)) {
      counts[choice] += 1;
      total += 1;
    }
  }

  return {
    round: round,
    counts: counts,
    total: total,
    updatedAt: new Date().toISOString(),
  };
}

/** 在表頭列裡找出「包含」某關鍵字的欄位索引（找不到回傳 -1） */
function findColumnIndex(header, keyword) {
  for (var i = 0; i < header.length; i++) {
    var cell = header[i] === undefined || header[i] === null ? "" : String(header[i]);
    if (cell.indexOf(keyword) !== -1) return i;
  }
  return -1;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
