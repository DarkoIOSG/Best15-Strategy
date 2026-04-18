"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

interface Props {
  bullCount: number;
  neutCount: number;
  bearCount: number;
  bullSignals?: string[];
  bearSignals?: string[];
}

function CustomTooltip({ active, label, payload, bullSignals, bearSignals }: {
  active?: boolean; label?: string; payload?: { value: number }[];
  bullSignals?: string[]; bearSignals?: string[];
}) {
  if (!active || !payload?.length) return null;
  const signals = label === "Bullish" ? bullSignals : label === "Bearish" ? bearSignals : undefined;
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl max-w-xs">
      <div className="text-gray-300 font-medium mb-1">{label}: {payload[0].value}</div>
      {signals && signals.length > 0 && (
        <div className="text-gray-500 space-y-0.5 max-h-40 overflow-y-auto">
          {signals.slice(0, 20).map((s) => <div key={s}>{s}</div>)}
          {signals.length > 20 && <div>+{signals.length - 20} more</div>}
        </div>
      )}
    </div>
  );
}

export default function SignalBreakdownChart({ bullCount, neutCount, bearCount, bullSignals, bearSignals }: Props) {
  const total = bullCount + neutCount + bearCount;
  const data = [
    { name: "Bullish", value: bullCount, pct: total ? ((bullCount / total) * 100).toFixed(0) : 0, color: "#00b894" },
    { name: "Neutral", value: neutCount, pct: total ? ((neutCount / total) * 100).toFixed(0) : 0, color: "#4b5563" },
    { name: "Bearish", value: bearCount, pct: total ? ((bearCount / total) * 100).toFixed(0) : 0, color: "#e17055" },
  ];

  return (
    <div>
      <div className="flex justify-around mb-4">
        {data.map((d) => (
          <div key={d.name} className="text-center">
            <div className="text-3xl font-bold font-mono" style={{ color: d.color }}>{d.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{d.name} ({d.pct}%)</div>
          </div>
        ))}
      </div>
      <div className="h-2 rounded-full overflow-hidden flex mb-4">
        {data.map((d) => (
          <div key={d.name} style={{ width: `${d.pct}%`, background: d.color }} />
        ))}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 16, right: 10, left: 0, bottom: 5 }}>
          <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} width={30} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip bullSignals={bullSignals} bearSignals={bearSignals} />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
            <LabelList dataKey="value" position="top" style={{ fill: "#e5e7eb", fontSize: 12, fontWeight: "600" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
