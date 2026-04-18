import type { StrategyData, Metrics } from "@/lib/types";

type MetricKey = keyof Metrics;

const ROWS: {
  key: MetricKey;
  label: string;
  suffix: string;
  decimals: number;
  positive: boolean | null;
}[] = [
  { key: "totalReturn",   label: "Total Return",     suffix: "%",  decimals: 2,  positive: true },
  { key: "annReturn",     label: "Ann. Return",       suffix: "%",  decimals: 2,  positive: true },
  { key: "annVolatility", label: "Ann. Volatility",   suffix: "%",  decimals: 2,  positive: false },
  { key: "sharpe",        label: "Sharpe Ratio",      suffix: "",   decimals: 3,  positive: true },
  { key: "sortino",       label: "Sortino Ratio",     suffix: "",   decimals: 3,  positive: true },
  { key: "maxDrawdown",   label: "Max Drawdown",      suffix: "%",  decimals: 2,  positive: false },
  { key: "calmar",        label: "Calmar Ratio",      suffix: "",   decimals: 3,  positive: true },
  { key: "winRate",       label: "Win Rate",          suffix: "%",  decimals: 1,  positive: true },
  { key: "bestDay",       label: "Best Day",          suffix: "%",  decimals: 2,  positive: true },
  { key: "worstDay",      label: "Worst Day",         suffix: "%",  decimals: 2,  positive: false },
  { key: "numDays",       label: "# Trading Days",    suffix: "",   decimals: 0,  positive: null },
];

function valueColor(key: MetricKey, val: number): string {
  const row = ROWS.find((r) => r.key === key);
  if (!row || row.positive === null) return "text-gray-200";
  if (row.positive) return val >= 0 ? "text-green-400" : "text-red-400";
  // negative-is-bad metrics: volatility red, drawdown red
  if (key === "annVolatility") return "text-gray-200";
  return val <= 0 ? "text-red-400" : "text-orange-300";
}

export default function MetricsTable({ strategies }: { strategies: Record<string, StrategyData> }) {
  const entries = Object.entries(strategies);

  return (
    <table className="w-full text-sm min-w-[480px]">
      <thead>
        <tr className="border-b border-[#2d3144]">
          <th className="text-left px-4 py-3 text-gray-500 font-medium w-40">Metric</th>
          {entries.map(([key, s]) => (
            <th
              key={key}
              className="text-right px-4 py-3 font-semibold"
              style={{ color: s.color }}
            >
              {s.displayName}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map(({ key, label, suffix, decimals }) => (
          <tr
            key={key}
            className="border-b border-[#2d3144]/40 hover:bg-[#252836] transition-colors"
          >
            <td className="px-4 py-2.5 text-gray-400 text-xs">{label}</td>
            {entries.map(([stKey, s]) => {
              const raw = s.metrics?.[key];
              if (raw === null || raw === undefined) {
                return (
                  <td key={stKey} className="px-4 py-2.5 text-right font-mono text-gray-600 text-xs">
                    —
                  </td>
                );
              }
              const num = Number(raw);
              const display = `${num.toFixed(decimals)}${suffix}`;
              return (
                <td
                  key={stKey}
                  className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${valueColor(key, num)}`}
                >
                  {display}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
