"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { ChartPoint } from "@/lib/privateFundTypes";

interface Props {
  chartSeries: ChartPoint[];
}

const SERIES = [
  { key: "index" as const, label: "Private Fund Index", color: "#8b5cf6" },
  { key: "btc" as const, label: "Bitcoin", color: "#f97316" },
  { key: "combined" as const, label: "Index + Signal (50/50)", color: "#06b6d4" },
];

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-2">{label}</div>
      {[...payload]
        .sort((a, b) => b.value - a.value)
        .map((p) => {
          const pct = ((p.value / 1000 - 1) * 100).toFixed(2);
          const pctNum = parseFloat(pct);
          const series = SERIES.find((s) => s.key === p.dataKey);
          return (
            <div key={p.dataKey} className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="text-gray-300 w-36">{series?.label ?? p.dataKey}</span>
              <span className="font-mono ml-auto text-right" style={{ color: pctNum >= 0 ? "#4ade80" : "#f87171" }}>
                {pctNum >= 0 ? "+" : ""}
                {pct}%
              </span>
              <span className="font-mono text-gray-500 w-16 text-right">{p.value.toFixed(1)}</span>
            </div>
          );
        })}
    </div>
  );
}

export default function PrivateFundIndexChart({ chartSeries }: Props) {
  const [active, setActive] = useState<Set<string>>(() => new Set(SERIES.map((s) => s.key)));

  const toggle = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const filteredData = useMemo(
    () => chartSeries.filter((p) => SERIES.some((s) => active.has(s.key) && p[s.key] !== undefined)),
    [chartSeries, active],
  );

  // Y-axis domain
  const allValues = filteredData.flatMap((p) =>
    SERIES.filter((s) => active.has(s.key))
      .map((s) => p[s.key])
      .filter((v): v is number => v !== undefined),
  );
  const minVal = allValues.length ? Math.floor(Math.min(...allValues) * 0.998) : 950;
  const maxVal = allValues.length ? Math.ceil(Math.max(...allValues) * 1.002) : 1100;

  return (
    <div>
      {/* Legend / toggle */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SERIES.map((s) => {
          const on = active.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: on ? `${s.color}22` : "transparent",
                border: `1px solid ${on ? s.color : "#3d4166"}`,
                color: on ? s.color : "#6b7280",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? s.color : "#6b7280" }} />
              {s.label}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartSeries} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3144" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={30}
          />
          <YAxis
            domain={[minVal, maxVal]}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            width={60}
            tickFormatter={(v: number) => v.toFixed(0)}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={1000} stroke="#4b5563" strokeDasharray="4 3" strokeWidth={1} />
          {SERIES.filter((s) => active.has(s.key)).map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              dot={false}
              strokeWidth={2}
              connectNulls
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 text-center text-xs text-gray-600">
        Base 1,000 · May 1, 2026 · Index+Signal = 50% index / 50% cash, fixed until next rebalance
      </div>
    </div>
  );
}
