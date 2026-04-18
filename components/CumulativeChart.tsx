"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import type { StrategyData } from "@/lib/types";

interface Props {
  strategies: Record<string, StrategyData>;
  rebalanceDates: string[];
}

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active, label, payload, strategies,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
  strategies: Record<string, StrategyData>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-2">{label}</div>
      {[...payload].sort((a, b) => b.value - a.value).map((p) => {
        const pct = ((p.value - 1) * 100).toFixed(2);
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-gray-300 w-28">{strategies[p.dataKey]?.displayName ?? p.dataKey}</span>
            <span className="font-mono ml-auto" style={{ color: p.value >= 1 ? "#4ade80" : "#f87171" }}>
              {p.value >= 1 ? "+" : ""}{pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CumulativeChart({ strategies, rebalanceDates }: Props) {
  const [active, setActive] = useState<Set<string>>(() => new Set(Object.keys(strategies)));

  const toggle = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    for (const [key, strat] of Object.entries(strategies)) {
      if (!active.has(key)) continue;
      for (const d of strat.dailyData) {
        if (!dateMap.has(d.date)) dateMap.set(d.date, {});
        dateMap.get(d.date)![key] = d.cumReturn;
      }
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [strategies, active]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(strategies).map(([key, strat]) => {
          const on = active.has(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: on ? `${strat.color}22` : "transparent",
                border: `1px solid ${on ? strat.color : "#3d4166"}`,
                color: on ? strat.color : "#6b7280",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? strat.color : "#6b7280" }} />
              {strat.displayName}
            </button>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
          Select at least one strategy
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3144" />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)} minTickGap={40} />
            <YAxis tickFormatter={(v: number) => `${((v - 1) * 100).toFixed(0)}%`}
              tick={{ fill: "#6b7280", fontSize: 11 }} width={55} />
            <Tooltip content={<CustomTooltip strategies={strategies} />} />
            {rebalanceDates.map((d) => (
              <ReferenceLine key={d} x={d} stroke="#4b5563" strokeDasharray="4 3" strokeWidth={1} />
            ))}
            {Object.entries(strategies)
              .filter(([key]) => active.has(key))
              .map(([key, strat]) => (
                <Line key={key} type="monotone" dataKey={key} stroke={strat.color}
                  dot={false} strokeWidth={2} connectNulls activeDot={{ r: 4, strokeWidth: 0 }} />
              ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
