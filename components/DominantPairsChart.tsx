"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import type { DominantPair } from "@/lib/types";

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ReturnType<typeof buildData>[0] }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-300 font-medium mb-1">{d.s1} × {d.s2}</div>
      <div className="text-gray-400">Power: <span className="text-white font-mono">{d.power.toFixed(3)}</span></div>
      <div className="text-gray-400">Windows: <span className="text-white">{d.windows.join(", ")}</span></div>
    </div>
  );
}

function buildData(pairs: DominantPair[]) {
  return [...pairs]
    .slice(0, 10)
    .sort((a, b) => a.power - b.power)
    .map((p) => ({
      label: `${p.s1.slice(0, 14)} × ${p.s2.slice(0, 14)}`,
      power: Math.round(p.power * 1000) / 1000,
      s1: p.s1,
      s2: p.s2,
      windows: p.windows,
      both: p.windows.length > 1,
    }));
}

export default function DominantPairsChart({ pairs }: { pairs: DominantPair[] }) {
  if (!pairs.length) {
    return <div className="h-40 flex items-center justify-center text-gray-500 text-sm">No pair data</div>;
  }
  const data = buildData(pairs);

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category" dataKey="label"
          tick={{ fill: "#9ca3af", fontSize: 9 }}
          width={180} axisLine={false} tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="power" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.both ? "#a78bfa" : "#6c5ce7"} fillOpacity={0.85} />
          ))}
          <LabelList
            dataKey="power"
            position="right"
            style={{ fill: "#9ca3af", fontSize: 10 }}
            formatter={(v: number) => v.toFixed(2)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
