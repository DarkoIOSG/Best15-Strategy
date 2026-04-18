import { readFileSync } from "fs";
import { join } from "path";
import type { CycleSignalData, CycleSignalState, CycleHistoryPoint } from "./types";

export function loadCycleData(): CycleSignalData {
  let state: CycleSignalState | null = null;
  let history: CycleHistoryPoint[] = [];

  try {
    const raw = readFileSync(join(process.cwd(), "data", "cycle_state.json"), "utf-8");
    state = JSON.parse(raw) as CycleSignalState;
  } catch {
    // file not yet generated
  }

  try {
    const raw = readFileSync(join(process.cwd(), "data", "cycle_history.json"), "utf-8");
    history = JSON.parse(raw) as CycleHistoryPoint[];
  } catch {
    // file not yet generated
  }

  return { state, history };
}
