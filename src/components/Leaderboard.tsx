import { useMemo } from "react";
import type { GameRecord } from "../state/gameMachine";
import { downloadRecordsCsv, sortLeaderboard } from "../app/records";

export interface LeaderboardProps {
  records: GameRecord[];
  onClearRecords: () => void;
  onClose: () => void;
}

const RESULT_LABEL: Record<GameRecord["result"], string> = {
  champion: "全破",
  gameOver: "答錯出局",
  walkedAway: "帶走獎勵",
};

/** 大廳可以開啟的排行榜：依通過關數排序，同分時比較少用提示卡的排前面；可以匯出 CSV 或清除全部紀錄。 */
export default function Leaderboard({ records, onClearRecords, onClose }: LeaderboardProps) {
  const sorted = useMemo(() => sortLeaderboard(records), [records]);

  const handleExport = () => downloadRecordsCsv(records);

  const handleClear = () => {
    if (window.confirm("確定要清除全部場次紀錄嗎？這個動作沒辦法復原。")) {
      onClearRecords();
    }
  };

  return (
    <div className="tpi-settings-modal" role="dialog" aria-label="排行榜">
      <div className="tpi-settings-modal__panel tpi-leaderboard__panel">
        <h2 style={{ fontFamily: "var(--tpi-font-heading)", margin: 0 }}>排行榜</h2>

        {sorted.length === 0 ? (
          <p>還沒有場次紀錄。</p>
        ) : (
          <div className="tpi-leaderboard__table-wrap">
            <table className="tpi-leaderboard__table">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>參賽者</th>
                  <th>結果</th>
                  <th>通過關數</th>
                  <th>使用提示卡</th>
                  <th>時間</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((record, i) => (
                  <tr key={`${record.contestantName}-${record.timestamp}-${i}`}>
                    <td>{i + 1}</td>
                    <td>{record.contestantName}</td>
                    <td>{RESULT_LABEL[record.result] ?? record.result}</td>
                    <td>{record.clearedLevels}</td>
                    <td>{record.lifelinesUsed.length}</td>
                    <td>{new Date(record.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="tpi-lobby__actions">
          <button type="button" className="tpi-btn" onClick={handleExport} disabled={records.length === 0}>
            匯出 CSV
          </button>
          <button type="button" className="tpi-btn tpi-btn--danger" onClick={handleClear} disabled={records.length === 0}>
            清除全部紀錄
          </button>
          <button type="button" className="tpi-btn tpi-btn--outline" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
