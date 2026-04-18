"use client";

import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { StrategyData } from "@/lib/types";

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
      {[...payload].sort((a, b) => a.value - b.value).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-300 w-28">{strategies[p.dataKey]?.displayName ?? p.dataKey}</span>
          <span className="font-mono ml-auto text-red-400">{p.value.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function DrawdownChart({ strategies }: { strategies: Record<string, StrategyData> }) {
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
      let peak = -Infinity;
      for (const d of strat.dailyData) {
        if (d.cumReturn > peak) peak = d.cumReturn;
        const dd = peak > 0 ? (d.cumReturn / peak - 1) * 100 : 0;
        if (!dateMap.has(d.date)) dateMap.set(d.date, {});
        dateMap.get(d.date)![key] = dd;
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
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3144" />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)} minTickGap={40} />
            <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              tick={{ fill: "#6b7280", fontSize: 11 }} width={45} />
            <Tooltip content={<CustomTooltip strategies={strategies} />} />
            {Object.entries(strategies)
              .filter(([key]) => active.has(key))
              .map(([key, strat]) => (
                <Area key={key} type="monotone" dataKey={key} stroke={strat.color}
                  fill={strat.color} fillOpacity={0.08} dot={false} strokeWidth={1.5}
                  connectNulls activeDot={{ r: 3, strokeWidth: 0 }} />
              ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
