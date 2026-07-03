export interface GridPos { r: number; c: number }
export interface GridState { active: GridPos | null; editing: boolean }

export type GridAction =
  | { type: "activate"; r: number; c: number }
  | { type: "move"; dr: number; dc: number; rows: number; cols: number }
  | { type: "tab"; dir: 1 | -1; rows: number; cols: number }
  | { type: "beginEdit" }
  | { type: "cancelEdit" }
  | { type: "commitMoveDown"; rows: number };

export const INITIAL_GRID: GridState = { active: null, editing: false };

const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max - 1));

export function reduceGrid(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case "activate":
      return { active: { r: action.r, c: action.c }, editing: false };
    case "move": {
      const cur = state.active ?? { r: 0, c: 0 };
      if (!state.active) return { active: { r: 0, c: 0 }, editing: false };
      return {
        active: { r: clamp(cur.r + action.dr, action.rows), c: clamp(cur.c + action.dc, action.cols) },
        editing: false,
      };
    }
    case "tab": {
      const cur = state.active ?? { r: 0, c: 0 };
      let r = cur.r;
      let c = cur.c + action.dir;
      if (c >= action.cols) { c = 0; r = clamp(r + 1, action.rows); if (r === cur.r) c = action.cols - 1; }
      else if (c < 0) { c = action.cols - 1; r = clamp(r - 1, action.rows); if (r === cur.r) c = 0; }
      return { active: { r, c }, editing: false };
    }
    case "beginEdit":
      return state.active ? { ...state, editing: true } : state;
    case "cancelEdit":
      return { ...state, editing: false };
    case "commitMoveDown": {
      const cur = state.active ?? { r: 0, c: 0 };
      return { active: { r: clamp(cur.r + 1, action.rows), c: cur.c }, editing: false };
    }
    default:
      return state;
  }
}
