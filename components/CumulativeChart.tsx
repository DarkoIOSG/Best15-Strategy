"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { StrategyData } from "@/lib/types";

interface Props {
  strategies: Record<string, StrategyData>;
  rebalanceDates: string[];
}

function buildChartData(strategies: Record<string, StrategyData>) {
  const dateMap = new Map<string, Record<string, number>>();

  for (const [key, strat] of Object.entries(strategies)) {
    for (const d of strat.dailyData) {
      if (!dateMap.has(d.date)) dateMap.set(d.date, {});
      dateMap.get(d.date)![key] = d.cumReturn;
    }
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));
}

function formatDate(d: string) {
  return d.slice(5); // MM-DD
}

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
  strategies: Record<string, StrategyData>;
}

function CustomTooltip({ active, label, payload, strategies }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-2">{label}</div>
      {payload.map((p) => {
        const pct = ((p.value - 1) * 100).toFixed(2);
        const sign = p.value >= 1 ? "+" : "";
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-gray-300 w-28">{strategies[p.dataKey]?.displayName ?? p.dataKey}</span>
            <span className="font-mono ml-auto" style={{ color: p.value >= 1 ? "#4ade80" : "#f87171" }}>
              {sign}{pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CumulativeChart({ strategies, rebalanceDates }: Props) {
  const data = buildChartData(strategies);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">No data</div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3144" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          tickFormatter={formatDate}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v: number) => `${((v - 1) * 100).toFixed(0)}%`}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          width={55}
        />
        <Tooltip content={<CustomTooltip strategies={strategies} />} />
        <Legend
          formatter={(v: string) => (
            <span style={{ color: strategies[v]?.color, fontSize: 12 }}>
              {strategies[v]?.displayName ?? v}
            </span>
          )}
        />
        {rebalanceDates.map((d) => (
          <ReferenceLine key={d} x={d} stroke="#4b5563" strokeDasharray="4 3" strokeWidth={1} />
        ))}
        {Object.entries(strategies).map(([key, strat]) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={strat.color}
            dot={false}
            strokeWidth={2}
            connectNulls
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
