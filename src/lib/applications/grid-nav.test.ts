import { describe, it, expect } from "vitest";
import { reduceGrid, INITIAL_GRID, type GridState } from "./grid-nav";

const at = (r: number, c: number, editing = false): GridState => ({ active: { r, c }, editing });

describe("reduceGrid", () => {
  it("activates a cell (not editing)", () => {
    expect(reduceGrid(INITIAL_GRID, { type: "activate", r: 2, c: 1 })).toEqual(at(2, 1));
  });

  it("moves and clamps to grid bounds", () => {
    expect(reduceGrid(at(0, 0), { type: "move", dr: -1, dc: -1, rows: 3, cols: 3 })).toEqual(at(0, 0));
    expect(reduceGrid(at(1, 1), { type: "move", dr: 1, dc: 1, rows: 3, cols: 3 })).toEqual(at(2, 2));
    expect(reduceGrid(at(2, 2), { type: "move", dr: 1, dc: 1, rows: 3, cols: 3 })).toEqual(at(2, 2));
  });

  it("move from null activates 0,0", () => {
    expect(reduceGrid(INITIAL_GRID, { type: "move", dr: 1, dc: 0, rows: 3, cols: 3 })).toEqual(at(0, 0));
  });

  it("tab advances horizontally and wraps to the next row", () => {
    expect(reduceGrid(at(0, 2), { type: "tab", dir: 1, rows: 3, cols: 3 })).toEqual(at(1, 0));
    expect(reduceGrid(at(1, 0), { type: "tab", dir: -1, rows: 3, cols: 3 })).toEqual(at(0, 2));
    expect(reduceGrid(at(2, 2), { type: "tab", dir: 1, rows: 3, cols: 3 })).toEqual(at(2, 2)); // clamp at end
  });

  it("begin/cancel edit toggles the editing flag", () => {
    expect(reduceGrid(at(1, 1), { type: "beginEdit" })).toEqual(at(1, 1, true));
    expect(reduceGrid(at(1, 1, true), { type: "cancelEdit" })).toEqual(at(1, 1, false));
  });

  it("commitMoveDown clears editing and moves down one (clamped)", () => {
    expect(reduceGrid(at(0, 1, true), { type: "commitMoveDown", rows: 3 })).toEqual(at(1, 1, false));
    expect(reduceGrid(at(2, 1, true), { type: "commitMoveDown", rows: 3 })).toEqual(at(2, 1, false));
  });
});
