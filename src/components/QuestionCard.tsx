import type { Question } from "../data/types";
import { stripLeadingEmoji } from "../data/picker";

export interface QuestionCardProps {
  question: Question;
  level: number;
}

/** 奶油色大圓角卡；題目字級 >=48px；有圖片網址時顯示圖片 */
export default function QuestionCard({ question, level }: QuestionCardProps) {
  return (
    <section className="tpi-question-card" aria-label="題目">
      <div className="tpi-question-card__inner">
        <div className="tpi-question-card__meta">
          <span>第 {level} 關</span>
          <span>{stripLeadingEmoji(question.categoryName)}</span>
          <span>難度 {question.difficulty}</span>
        </div>
        <p className="tpi-question-card__text">{question.text}</p>
        {question.imageUrl && (
          <img className="tpi-question-card__image" src={question.imageUrl} alt="題目附圖" />
        )}
      </div>
    </section>
  );
}
