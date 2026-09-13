// 「全場一起協助」投票設定：存在 localStorage，設定頁可調整。

export interface VoteSettings {
  /** Google 表單「取得預先填入的連結」網址樣板，題號位置用 {round} 佔位 */
  formUrl: string;
  /** Apps Script Web App 網址（doGet 統計端點） */
  statsUrl: string;
  /** 輪詢間隔（毫秒） */
  intervalMs: number;
  /** 是否啟用線上投票（關閉時直接使用手動輸入） */
  enabled: boolean;
}

const STORAGE_KEY = "quiz.vote.settings.v1";

export const DEFAULT_VOTE_SETTINGS: VoteSettings = {
  formUrl: "",
  statsUrl: "",
  intervalMs: 2000,
  enabled: false,
};

/** 讀取設定；localStorage 沒有資料、不可用或內容毀損時回傳預設值 */
export function loadVoteSettings(): VoteSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOTE_SETTINGS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_VOTE_SETTINGS };
    }
    return { ...DEFAULT_VOTE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_VOTE_SETTINGS };
  }
}

/** 儲存設定；localStorage 不可用時靜默失敗（例如私密瀏覽模式） */
export function saveVoteSettings(settings: VoteSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 忽略：現場環境不應該因為存不進 localStorage 而中斷
  }
}
