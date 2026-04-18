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

export interface PerformanceData {
  lastUpdated: string;
  latestRebalanceDate: string;
  rebalanceDates: string[];
  strategies: Record<string, StrategyData>;
}
