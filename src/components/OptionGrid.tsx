import type { OptionKey, Question } from "../data/types";

const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

export interface OptionGridProps {
  question: Question;
  selected?: OptionKey;
  removedOption?: OptionKey;
  /** 已經鎖定答案，尚未揭曉 */
  locked: boolean;
  /** 已經揭曉 */
  revealed: boolean;
  correct?: boolean;
  /** 可以點選（例如 counting / answering 階段），揭曉或鎖定後一律不可點選 */
  selectable: boolean;
  onSelect: (option: OptionKey) => void;
}

/** 2x2 選項；四色對應 A綠 B紅 C藍 D金；狀態：選取/鎖定(脈動)/刪除(淡出+刪除線)/正確(金光+勾+彈跳)/錯誤(灰階+叉+搖晃) */
export default function OptionGrid({
  question,
  selected,
  removedOption,
  locked,
  revealed,
  correct,
  selectable,
  onSelect,
}: OptionGridProps) {
  return (
    <div className="tpi-options" role="group" aria-label="選項">
      {OPTION_KEYS.map((key) => {
        const isRemoved = removedOption === key;
        const isSelected = selected === key;
        const isCorrectAnswer = question.correct === key;
        const showCorrect = revealed && isCorrectAnswer;
        const showWrong = revealed && isSelected && !isCorrectAnswer;

        const classes = ["tpi-option", `tpi-option--${key}`];
        if (isSelected && !revealed) classes.push("tpi-option--selected");
        if (isSelected && locked && !revealed) classes.push("tpi-option--locked");
        if (isRemoved) classes.push("tpi-option--removed");
        if (showCorrect) classes.push("tpi-option--correct");
        if (showWrong) classes.push("tpi-option--wrong");

        const disabled = !selectable || isRemoved || locked || revealed;

        let badge: string | null = null;
        if (showCorrect) badge = "✓";
        else if (showWrong) badge = "✗";

        return (
          <button
            key={key}
            type="button"
            className={classes.join(" ")}
            disabled={disabled}
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
            aria-label={`選項 ${key}：${question.options[key]}${showCorrect ? "（正確答案）" : ""}${
              showWrong ? "（答錯）" : ""
            }`}
          >
            <span className="tpi-option__letter">{key}</span>
            <span className="tpi-option__text">{question.options[key]}</span>
            {badge && (
              <span className="tpi-option__badge" aria-hidden="true">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
