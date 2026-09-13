import type { Question } from "../data/types";

export interface ExplanationCardProps {
  question: Question;
}

/** 揭曉後從下方滑出的奶油色詳解卡：結論、詳解、冷知識標籤、六法全書小圖示 */
export default function ExplanationCard({ question }: ExplanationCardProps) {
  return (
    <div className="tpi-explanation">
      <div className="tpi-explanation__card" role="note" aria-label="詳解">
        <h2 className="tpi-explanation__conclusion">
          <span aria-hidden="true">📘</span>
          {question.conclusion ?? `正確答案是 ${question.correct}`}
        </h2>
        <p className="tpi-explanation__body">{question.explanation}</p>
        {question.funFact && <span className="tpi-explanation__funfact">💡 冷知識：{question.funFact}</span>}
      </div>
    </div>
  );
}
