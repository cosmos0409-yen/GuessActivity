// hostcards.html 的進入點：獨立於主遊戲頁面之外，載入同一份題庫並顯示主持人手卡。
// 主持人可以在活動前用新分頁開啟這個頁面，篩選題型／難度後直接列印。

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { loadQuestionBank } from "../data/questionSource";
import type { QuestionBank } from "../data/types";
import HostCards from "./HostCards";
import "../styles/app.css";

function HostCardsApp() {
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQuestionBank()
      .then(setBank)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <main style={{ padding: 32 }}>
        <h1>題庫載入失敗</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!bank) {
    return (
      <main style={{ padding: 32 }}>
        <p>題庫載入中…</p>
      </main>
    );
  }

  return <HostCards bank={bank} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HostCardsApp />
  </StrictMode>,
);
