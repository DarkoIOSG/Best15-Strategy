export interface DailyDataPoint {
  date: string;
  return: number;
  cumReturn: number;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
}

export interface Metrics {
  totalReturn: number;
  annReturn: number;
  annVolatility: number;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number;
  calmar: number | null;
  winRate: number;
  bestDay: number;
  worstDay: number;
  numDays: number;
}

export interface WeightEntry {
  coin: string;
  weight: number;
}

export interface StrategyData {
  displayName: string;
  color: string;
  dailyData: DailyDataPoint[];
  metrics: Metrics | null;
  latestWeights: WeightEntry[];
  monthlyReturns: MonthlyReturn[];
}

export interface AssetDailyPoint {
  date: string;
  cumReturn: number;
}

export interface AssetData {
  displayName: string;
  type: "crypto" | "stock";
  color: string;
  dailyData: AssetDailyPoint[];
}

export interface PerformanceData {
  lastUpdated: string;
  latestRebalanceDate: string;
  rebalanceDates: string[];
  strategies: Record<string, StrategyData>;
  assets: Record<string, AssetData>;
}

export interface DominantPair {
  s1: string;
  s2: string;
  power: number;
  windows: string[];
}

export interface SignalFlip {
  signal: string;
  from: string;
  to: string;
}

export interface CooldownEvent {
  date: string;
  blocked_move: string;
  reason: string;
  remaining_days: number;
}

export interface CycleSignalState {
  date: string;
  btc_price: number;
  exposure: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  composite: number;
  gate: number;
  vol_z: number;
  vol_regime: "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  bull_count: number;
  neut_count: number;
  bear_count: number;
  bull_signals?: string[];
  bear_signals?: string[];
  neut_signals?: string[];
  flips: SignalFlip[];
  dominant_pairs: DominantPair[];
  cooldown_events: CooldownEvent[];
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  risk_factors: string[];
  cache_warnings: string[];
}

export interface CycleHistoryPoint {
  date: string;
  combo: number | null;
  exposure: number | null;
  btc_price?: number | null;
}

export interface CycleSignalData {
  state: CycleSignalState | null;
  history: CycleHistoryPoint[];
}
