"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import type { AssetData } from "@/lib/types";

interface Props {
  assets: Record<string, AssetData>;
  rebalanceDates: string[];
}

interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active, label, payload, assets,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
  assets: Record<string, AssetData>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl max-h-64 overflow-y-auto">
      <div className="text-gray-400 mb-2">{label}</div>
      {[...payload].sort((a, b) => b.value - a.value).map((p) => {
        const pct = ((p.value - 1) * 100).toFixed(2);
        return (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-gray-300 w-16">{assets[p.dataKey]?.displayName ?? p.dataKey}</span>
            <span className="font-mono ml-auto" style={{ color: p.value >= 1 ? "#4ade80" : "#f87171" }}>
              {p.value >= 1 ? "+" : ""}{pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AssetPerformanceChart({ assets, rebalanceDates }: Props) {
  const cryptoKeys = useMemo(
    () => Object.keys(assets).filter((k) => assets[k].type === "crypto"),
    [assets]
  );
  const stockKeys = useMemo(
    () => Object.keys(assets).filter((k) => assets[k].type === "stock"),
    [assets]
  );

  const [active, setActive] = useState<Set<string>>(() => new Set(Object.keys(assets)));

  const toggle = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleGroup = (keys: string[]) => {
    const allOn = keys.every((k) => active.has(k));
    setActive((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const toggleAll = () =>
    setActive(
      active.size === Object.keys(assets).length
        ? new Set()
        : new Set(Object.keys(assets))
    );

  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    for (const [key, asset] of Object.entries(assets)) {
      if (!active.has(key)) continue;
      for (const d of asset.dailyData) {
        if (!dateMap.has(d.date)) dateMap.set(d.date, {});
        dateMap.get(d.date)![key] = d.cumReturn;
      }
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [assets, active]);

  const allOn = active.size === Object.keys(assets).length;
  const cryptoAllOn = cryptoKeys.every((k) => active.has(k));
  const stockAllOn = stockKeys.every((k) => active.has(k));

  return (
    <div>
      {/* Group controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={toggleAll}
          className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
          style={{
            borderColor: allOn ? "#6b7280" : "#3d4166",
            color: allOn ? "#d1d5db" : "#6b7280",
            background: allOn ? "#ffffff11" : "transparent",
          }}
        >
          {allOn ? "Clear all" : "Select all"}
        </button>

        {cryptoKeys.length > 0 && (
          <button
            onClick={() => toggleGroup(cryptoKeys)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
            style={{
              borderColor: cryptoAllOn ? "#f7931a" : "#3d4166",
              color: cryptoAllOn ? "#f7931a" : "#6b7280",
              background: cryptoAllOn ? "#f7931a11" : "transparent",
            }}
          >
            Crypto
          </button>
        )}

        {stockKeys.length > 0 && (
          <button
            onClick={() => toggleGroup(stockKeys)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
            style={{
              borderColor: stockAllOn ? "#818cf8" : "#3d4166",
              color: stockAllOn ? "#818cf8" : "#6b7280",
              background: stockAllOn ? "#818cf811" : "transparent",
            }}
          >
            Stocks
          </button>
        )}

        <div className="w-px h-4 bg-[#2d3144] mx-1" />

        {/* Individual asset toggles */}
        {Object.entries(assets).map(([key, asset]) => {
          const on = active.has(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: on ? `${asset.color}22` : "transparent",
                border: `1px solid ${on ? asset.color : "#3d4166"}`,
                color: on ? asset.color : "#6b7280",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: on ? asset.color : "#6b7280" }}
              />
              {asset.displayName}
            </button>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
          Select at least one asset
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3144" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v: number) => `${((v - 1) * 100).toFixed(0)}%`}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              width={55}
            />
            <Tooltip content={<CustomTooltip assets={assets} />} />
            {rebalanceDates.map((d) => (
              <ReferenceLine key={d} x={d} stroke="#4b5563" strokeDasharray="4 3" strokeWidth={1} />
            ))}
            {Object.entries(assets)
              .filter(([key]) => active.has(key))
              .map(([key, asset]) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={asset.color}
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
