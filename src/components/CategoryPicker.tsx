import type { Category } from "../data/types";
import type { AvailabilityMap } from "../data/picker";

export interface CategoryPickerProps {
  categories: Category[];
  difficulty: number;
  availability: AvailabilityMap;
  onPick: (category: Category) => void;
  disabled?: boolean;
}

/** 題型卡片分成「法律」與「知識」左右兩區；該關難度沒有題目時停用 */
export default function CategoryPicker({
  categories,
  difficulty,
  availability,
  onPick,
  disabled,
}: CategoryPickerProps) {
  const enabledCategories = categories.filter((c) => c.enabled);
  const legal = enabledCategories.filter((c) => c.domain === "法律");
  const knowledge = enabledCategories.filter((c) => c.domain === "知識");

  const countFor = (name: string): number => availability[name]?.[difficulty] ?? 0;

  const renderCard = (category: Category) => {
    const count = countFor(category.name);
    const isDisabled = Boolean(disabled) || count <= 0;
    return (
      <button
        key={category.name}
        type="button"
        className="tpi-category-card"
        style={{ borderColor: isDisabled ? undefined : category.color }}
        disabled={isDisabled}
        onClick={() => onPick(category)}
        aria-label={`${category.name}，難度 ${difficulty}，剩餘 ${count} 題${isDisabled ? "（已停用）" : ""}`}
      >
        <span className="tpi-category-card__emoji" aria-hidden="true">
          {category.icon}
        </span>
        <span>{category.name}</span>
        <span className="tpi-category-card__count">剩餘 {count} 題</span>
      </button>
    );
  };

  return (
    <section className="tpi-picker" aria-label="選擇題型">
      <h2 className="tpi-picker__heading">參賽者，請選一種題型挑戰！</h2>
      <div className="tpi-picker__columns">
        <div className="tpi-picker__column">
          <h3 className="tpi-picker__column-title">⚖️ 法律</h3>
          <div className="tpi-picker__grid">{legal.map(renderCard)}</div>
        </div>
        <div className="tpi-picker__column">
          <h3 className="tpi-picker__column-title">🧠 知識</h3>
          <div className="tpi-picker__grid">{knowledge.map(renderCard)}</div>
        </div>
      </div>
    </section>
  );
}
