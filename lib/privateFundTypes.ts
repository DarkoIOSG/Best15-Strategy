export interface ChartPoint {
  date: string;
  index?: number;
  btc?: number;
  combined?: number;
}

export interface MetricsSummary {
  label: string;
  color: string;
  totalReturn: number;
  sharpe: number | null;
  maxDrawdown: number;
  annReturn: number;
  volatility: number;
}

export interface AssetPerfEntry {
  id: string;
  name: string;
  weight: number;
  totalReturn: number;
  // execution-price based
  executionPrice: number;
  currentPrice: number;
  amount: number;
  allocation: number;
  pnlDollar: number;
}
