"use client";

import { useMemo } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import type { CycleHistoryPoint } from "@/lib/types";

function fmt$(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function CustomTooltip({ active, label, payload }: {
  active?: boolean; label?: string;
  payload?: { name: string; value: number; color: string }[];
}) {
  if (!active || !payload?.length) return null;
  const exp = payload.find((p) => p.name === "Exposure");
  const btc = payload.find((p) => p.name === "BTC");
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl min-w-[140px]">
      <div className="text-gray-400 mb-2 font-medium">{label}</div>
      {btc && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 text-gray-300">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: btc.color }} />
            BTC
          </span>
          <span className="font-mono text-white">{fmt$(btc.value)}</span>
        </div>
      )}
      {exp && (
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-gray-300">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: exp.color }} />
            Exposure
          </span>
          <span
            className="font-mono font-semibold"
            style={{ color: exp.value >= 0.65 ? "#00b894" : exp.value <= 0.35 ? "#e17055" : "#fdcb6e" }}
          >
            {(exp.value * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

export default function Btc90ExposureChart({ history }: { history: CycleHistoryPoint[] }) {
  const data = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    return history
      .filter((p) => new Date(p.date) >= cutoff && p.exposure != null)
      .map((p) => ({
        date: p.date,
        Exposure: p.exposure,
        BTC: p.btc_price ?? null,
      }));
  }, [history]);

  const btcPrices = data.map((d) => d.BTC).filter((v): v is number => v != null);
  const btcMin = btcPrices.length ? Math.min(...btcPrices) * 0.97 : 0;
  const btcMax = btcPrices.length ? Math.max(...btcPrices) * 1.03 : 100_000;
  const hasBtc = btcPrices.length > 0;

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
        No history data for the last 90 days
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: hasBtc ? 64 : 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickFormatter={(d: string) => {
              const dt = new Date(d);
              return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
            minTickGap={48}
            axisLine={false}
            tickLine={false}
          />
          {/* Left axis — Exposure */}
          <YAxis
            yAxisId="exp"
            domain={[0, 1]}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tickCount={6}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          {/* Right axis — BTC price */}
          {hasBtc && (
            <YAxis
              yAxisId="btc"
              orientation="right"
              domain={[btcMin, btcMax]}
              tick={{ fill: "#f59e0b", fontSize: 11 }}
              tickFormatter={fmt$}
              axisLine={false}
              tickLine={false}
              width={58}
              tickCount={5}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="exp" y={0.5} stroke="#374151" strokeDasharray="4 3" />

          {/* Exposure — step area */}
          <Area
            yAxisId="exp"
            type="stepAfter"
            dataKey="Exposure"
            stroke="#818cf8"
            fill="#818cf8"
            fillOpacity={0.15}
            strokeWidth={2}
            dot={false}
            connectNulls
          />

          {/* BTC price — line */}
          {hasBtc && (
            <Line
              yAxisId="btc"
              type="monotone"
              dataKey="BTC"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              activeDot={{ r: 3, strokeWidth: 0, fill: "#f59e0b" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex gap-5 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-8 h-0.5 rounded" style={{ background: "#818cf8" }} />
          Exposure (left)
        </span>
        {hasBtc && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-0.5 rounded" style={{ background: "#f59e0b" }} />
            BTC Price (right)
          </span>
        )}
        {!hasBtc && (
          <span className="text-gray-600 italic">BTC price will appear after next script run</span>
        )}
      </div>
    </div>
  );
}
