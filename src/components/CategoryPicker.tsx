import { useState, type CSSProperties } from "react";
import type { Category } from "../data/types";
import { normalizeCategoryName, stripLeadingEmoji, type AvailabilityMap } from "../data/picker";

export interface CategoryPickerProps {
  categories: Category[];
  difficulty: number;
  availability: AvailabilityMap;
  /** 本場已經選過的題型名稱；每個題型每場只能選一次 */
  pickedCategories: Set<string>;
  /** 第二個參數：主持人是否明確選擇略過「同題型只能選一次」的限制 */
  onPick: (category: Category, allowRepeatCategory: boolean) => void;
  disabled?: boolean;
}

/**
 * 題型卡片不分領域，全部排在同一個格子裡（照題庫順序）；該關難度沒有題目時停用。
 * 每個題型每場只能選一次：已選過的題型會變灰停用並標示「已選過」；
 * 如果本關所有「還沒選過」的題型都沒有題目可抽（題型數多於關卡數時理論上不會發生），
 * 才會出現「允許重選已用過的題型」的選項讓主持人自行略過限制。
 */
export default function CategoryPicker({
  categories,
  difficulty,
  availability,
  pickedCategories,
  onPick,
  disabled,
}: CategoryPickerProps) {
  const [allowRepeat, setAllowRepeat] = useState(false);

  // 不分領域，全部照題庫「題型」分頁的順序排；盡量排成兩列，一列最多 5 張
  const enabledCategories = categories.filter((c) => c.enabled);
  const columns = Math.min(5, Math.max(1, Math.ceil(enabledCategories.length / 2)));

  const countFor = (name: string): number => availability[normalizeCategoryName(name)]?.[difficulty] ?? 0;
  // pickedCategories 裡的名稱也可能帶（或不帶）變體選擇符，一律正規化後再比對，
  // 否則同一個題型會因為 emoji 呈現方式不同被誤判成「還沒選過」（見 normalizeCategoryName 註解）。
  const isPicked = (name: string): boolean => pickedCategories.has(normalizeCategoryName(name));

  const freshPickable = enabledCategories.filter((c) => !isPicked(c.name) && countFor(c.name) > 0);
  const repeatPickable = enabledCategories.filter((c) => isPicked(c.name) && countFor(c.name) > 0);
  const anyPickable = freshPickable.length > 0 || repeatPickable.length > 0;
  const needsOverride = freshPickable.length === 0 && repeatPickable.length > 0;

  const renderCard = (category: Category) => {
    const count = countFor(category.name);
    const alreadyPicked = isPicked(category.name);
    const isDisabled = Boolean(disabled) || count <= 0 || (alreadyPicked && !allowRepeat);
    return (
      <button
        key={category.name}
        type="button"
        className="tpi-category-card"
        style={{ borderColor: isDisabled ? undefined : category.color }}
        disabled={isDisabled}
        onClick={() => onPick(category, alreadyPicked && allowRepeat)}
        aria-label={`${stripLeadingEmoji(category.name)}，難度 ${difficulty}，剩餘 ${count} 題${alreadyPicked ? "，已選過" : ""}${isDisabled ? "（已停用）" : ""}`}
      >
        <span className="tpi-category-card__emoji" aria-hidden="true">
          {category.icon}
        </span>
        <span>{stripLeadingEmoji(category.name)}</span>
        <span className="tpi-category-card__count">剩餘 {count} 題</span>
        {alreadyPicked && <span className="tpi-category-card__badge">已選過</span>}
      </button>
    );
  };

  return (
    <section className="tpi-picker" aria-label="選擇題型">
      <h2 className="tpi-picker__heading">參賽者，請選一種題型挑戰！</h2>
      <div className="tpi-picker__panel">
        <div className="tpi-picker__grid" style={{ "--tpi-picker-cols": columns } as CSSProperties}>
          {enabledCategories.map(renderCard)}
        </div>
      </div>
      {!anyPickable && (
        <p className="tpi-picker__notice" role="alert">
          本關所有題型都沒有題目可以抽，請主持人調整題庫或關卡設定後再試。
        </p>
      )}
      {needsOverride && (
        <label className="tpi-picker__override">
          <input type="checkbox" checked={allowRepeat} onChange={(e) => setAllowRepeat(e.target.checked)} />
          本關剩下的新題型都已經沒有題目了，允許主持人重選已經用過的題型
        </label>
      )}
    </section>
  );
}
