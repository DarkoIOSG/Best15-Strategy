import { readFileSync } from "fs";
import { join } from "path";
import type { PerformanceData } from "./types";

export function loadPerformanceData(): PerformanceData {
  try {
    const filePath = join(process.cwd(), "data", "performance.json");
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as PerformanceData;
  } catch {
    return {
      lastUpdated: "",
      latestRebalanceDate: "",
      rebalanceDates: [],
      strategies: {},
      assets: {},
    };
  }
}
