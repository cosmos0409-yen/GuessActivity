// 題庫資料型別定義

/** 領域：法律或知識 */
export type Domain = "法律" | "知識";

/** 上架狀態 */
export type QuestionStatus = "上架" | "待審";

/** 選項代號 */
export type OptionKey = "A" | "B" | "C" | "D";

/** 單一題目 */
export interface Question {
  id: string;
  /** 題型名稱（對應題型表的「名稱」） */
  categoryName: string;
  domain: Domain;
  /** 難度 1-5 */
  difficulty: number;
  text: string;
  imageUrl?: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
  /** 刪除選項優先（若有指定，「刪除一個選項」提示卡優先刪這個） */
  removalPriority?: OptionKey;
  conclusion?: string;
  explanation: string;
  funFact?: string;
  hostNotes?: string;
  source?: string;
  status: QuestionStatus;
}

/** 單一題型 */
export interface Category {
  name: string;
  domain: Domain;
  icon: string;
  color: string;
  enabled: boolean;
}

/** 讀取題庫時的一則警告（列號＋原因），不會中斷整體讀取 */
export interface QuestionWarning {
  /** 原始 CSV 資料列號（含表頭，從 1 起算；表頭視為第 1 列） */
  row: number;
  reason: string;
}

/** 題庫資料來源 */
export type BankSource = "remote" | "cache" | "bundled";

/** 完整題庫（含來源資訊與警告） */
export interface QuestionBank {
  questions: Question[];
  categories: Category[];
  source: BankSource;
  /** 資料的時間戳（ISO 字串）：remote/cache 為快取寫入時間，bundled 為讀取當下時間 */
  fetchedAt: string;
  warnings: QuestionWarning[];
}
