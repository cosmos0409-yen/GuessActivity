import { useMemo, useState } from "react";
import type { Category, Question, QuestionBank } from "../data/types";
import { filterHostCardQuestions, sortHostCardQuestions, type HostCardsFilter } from "./hostCardsFilter";

export interface HostCardsProps {
  bank: QuestionBank;
}

const DIFFICULTIES = [1, 2, 3, 4, 5];

function categoryOptions(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

/**
 * 主持人手卡：一題一張，適合 A4 列印（見 styles/app.css 的 @media print）。
 * 預設只顯示「上架」的題目，可以依題型或難度篩選、也可以切換顯示待審題目（例如彩排前確認內容）。
 */
export default function HostCards({ bank }: HostCardsProps) {
  const [filter, setFilter] = useState<HostCardsFilter>({});

  const questions = useMemo(
    () => sortHostCardQuestions(filterHostCardQuestions(bank.questions, filter)),
    [bank.questions, filter],
  );

  return (
    <div className="hostcards">
      <div className="hostcards__toolbar no-print">
        <h1>主持人手卡</h1>
        <label>
          題型
          <select
            value={filter.categoryName ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, categoryName: e.target.value || undefined }))}
          >
            <option value="">全部題型</option>
            {categoryOptions(bank.categories).map((c) => (
              <option key={c.name} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          難度
          <select
            value={filter.difficulty ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, difficulty: e.target.value ? Number(e.target.value) : undefined }))}
          >
            <option value="">全部難度</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                難度 {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={filter.includeUnlisted ?? false}
            onChange={(e) => setFilter((f) => ({ ...f, includeUnlisted: e.target.checked }))}
          />
          包含待審題目
        </label>
        <button type="button" onClick={() => window.print()}>
          列印
        </button>
        <span className="hostcards__count">共 {questions.length} 題</span>
      </div>

      <div className="hostcards__grid">
        {questions.map((q) => (
          <HostCard key={q.id} question={q} />
        ))}
        {questions.length === 0 && <p className="no-print">找不到符合篩選條件的題目。</p>}
      </div>
    </div>
  );
}

const OPTION_KEYS: Array<keyof Question["options"]> = ["A", "B", "C", "D"];

function HostCard({ question }: { question: Question }) {
  return (
    <article className="hostcard">
      <header className="hostcard__header">
        <span className="hostcard__id">{question.id}</span>
        <span className="hostcard__category">{question.categoryName}</span>
        <span className="hostcard__difficulty">難度 {question.difficulty}</span>
        {question.status === "待審" && <span className="hostcard__unlisted">待審</span>}
      </header>

      <h2 className="hostcard__text">{question.text}</h2>

      <ul className="hostcard__options">
        {OPTION_KEYS.map((key) => (
          <li key={key} className={key === question.correct ? "hostcard__option--correct" : undefined}>
            <strong>{key}.</strong> {question.options[key]}
            {key === question.correct && <span className="hostcard__correct-mark"> ✓ 正解</span>}
          </li>
        ))}
      </ul>

      {question.conclusion && (
        <p className="hostcard__conclusion">
          <strong>結論：</strong>
          {question.conclusion}
        </p>
      )}

      <p className="hostcard__explanation">
        <strong>詳解：</strong>
        {question.explanation}
      </p>

      {question.funFact && (
        <p className="hostcard__funfact">
          <strong>冷知識：</strong>
          {question.funFact}
        </p>
      )}

      {question.hostNotes && (
        <p className="hostcard__hostnotes">
          <strong>主持人口白：</strong>
          {question.hostNotes}
        </p>
      )}

      {question.source && (
        <p className="hostcard__source">
          <strong>出處：</strong>
          {question.source}
        </p>
      )}
    </article>
  );
}
