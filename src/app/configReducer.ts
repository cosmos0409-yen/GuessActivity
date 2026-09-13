// 把「設定頁改規則／彩排模式」接到狀態機的 config，但完全不修改 src/state/gameMachine.ts
// （交接手冊規定這個檔案不能動）。gameMachine 的 reducer 沒有「更新 config」的 action，
// 因為 config 本來就設計成開局時決定、開局後不太會變；但主持人在大廳把設定頁的規則
// 改掉之後，理應在「下一場」生效，不需要重新整理頁面。
//
// 做法：包一層本地的 SET_CONFIG action，reducer 看到它就直接覆蓋 state.config，
// 其他 action 全部原封不動轉交給 gameMachine 的 reducer。純函式，方便測試。

import { reducer, type GameAction, type GameConfig, type GameState } from "../state/gameMachine";

export type AppAction = GameAction | { type: "SET_CONFIG"; config: GameConfig };

export function appReducer(state: GameState, action: AppAction): GameState {
  if (action.type === "SET_CONFIG") {
    if (state.config === action.config) return state;
    return { ...state, config: action.config };
  }
  return reducer(state, action);
}
