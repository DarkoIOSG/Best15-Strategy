"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { AssetPerfEntry } from "@/lib/privateFundTypes";

interface Props {
  assets: AssetPerfEntry[];
}

interface TooltipPayload {
  payload: AssetPerfEntry & { value: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1a1d29] border border-[#2d3144] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-200 font-medium mb-1">{d.name}</div>
      <div className="text-gray-400">
        Weight: <span className="text-white font-mono">{d.weight.toFixed(2)}%</span>
      </div>
      <div className="text-gray-400 mt-0.5">
        Return:{" "}
        <span className="font-mono font-medium" style={{ color: d.totalReturn >= 0 ? "#4ade80" : "#f87171" }}>
          {d.totalReturn >= 0 ? "+" : ""}
          {d.totalReturn.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export default function PrivateFundAssetPerf({ assets }: Props) {
  const sorted = useMemo(() => [...assets].sort((a, b) => b.totalReturn - a.totalReturn), [assets]);

  const shortNames: Record<string, string> = {
    bitcoin: "BTC",
    ethereum: "ETH",
    solana: "SOL",
    ripple: "XRP",
    cardano: "ADA",
    chainlink: "LINK",
    uniswap: "UNI",
    stellar: "XLM",
    litecoin: "LTC",
    "bitcoin-cash": "BCH",
    zcash: "ZEC",
    hyperliquid: "HYPE",
    morpho: "MORPHO",
    ethena: "ENA",
    "ether-fi": "ETHFI",
    binancecoin: "BNB",
    mstr: "MSTR",
    coin: "COIN",
    hood: "HOOD",
    crcl: "CRCL",
  };

  const chartData = sorted.map((a) => ({
    ...a,
    shortName: shortNames[a.id] ?? a.id.toUpperCase().slice(0, 5),
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3144" vertical={false} />
        <XAxis dataKey="shortName" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
          tick={{ fill: "#6b7280", fontSize: 10 }}
          width={52}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff08" }} />
        <ReferenceLine y={0} stroke="#4b5563" strokeWidth={1} />
        <Bar dataKey="totalReturn" radius={[3, 3, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.id} fill={entry.totalReturn >= 0 ? "#4ade80" : "#f87171"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
