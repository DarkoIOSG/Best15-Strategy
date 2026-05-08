"use client";

import { useState, useCallback, useEffect } from "react";
import type { AssetPerfEntry } from "@/lib/privateFundTypes";

interface Props {
  assets: AssetPerfEntry[];
  totalDeployed: number;
  executionDate: string;
}

interface PriceMap {
  [id: string]: number;
}

function fmt(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(6);
}

export default function PrivateFundPositionsLive({ assets, totalDeployed, executionDate }: Props) {
  const [livePrices, setLivePrices] = useState<PriceMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prices");
      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as { prices: PriceMap; timestamp: string };
      setLivePrices(data.prices);
      setLastUpdated(new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch {
      setError("Failed to fetch live prices");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => { refresh(); }, [refresh]);

  // Compute live P&L per asset
  const liveAssets = assets.map((a) => {
    const livePrice = livePrices?.[a.id];
    if (!livePrice || !a.executionPrice) return { ...a, isLive: false };
    const currentPrice = livePrice;
    const pnlDollar = a.amount * (currentPrice - a.executionPrice);
    const totalReturn = ((currentPrice / a.executionPrice) - 1) * 100;
    return {
      ...a,
      currentPrice: parseFloat(currentPrice.toFixed(currentPrice < 1 ? 6 : 2)),
      pnlDollar: parseFloat(pnlDollar.toFixed(2)),
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      isLive: true,
    };
  });

  const totalPnlDollar = liveAssets.reduce((s, a) => s + a.pnlDollar, 0);
  const totalPnlPct = totalDeployed > 0 ? (totalPnlDollar / totalDeployed) * 100 : 0;
  const currentValue = totalDeployed + totalPnlDollar;
  const hasLive = liveAssets.some((a) => a.isLive);

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {hasLive && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live prices
            </span>
          )}
          {lastUpdated && (
            <span className="text-xs text-gray-500">updated {lastUpdated}</span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: loading ? "#2d3144" : "#8b5cf622",
            border: "1px solid #8b5cf644",
            color: loading ? "#6b7280" : "#a78bfa",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <svg
            className={loading ? "animate-spin" : ""}
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {loading ? "Fetching…" : "Refresh prices"}
        </button>
      </div>

      {/* Portfolio summary */}
      {hasLive && (
        <div className="flex flex-wrap gap-6 px-4 py-3 mb-3 bg-[#0f1117] rounded-lg border border-[#2d3144] text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Deployed</div>
            <div className="font-mono font-medium text-gray-200">
              ${totalDeployed.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Current Value</div>
            <div className="font-mono font-medium text-white">
              ${currentValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Total P&amp;L</div>
            <div className="font-mono font-bold" style={{ color: totalPnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
              {totalPnlDollar >= 0 ? "+" : "−"}${Math.abs(totalPnlDollar).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Return</div>
            <div className="font-mono font-bold" style={{ color: totalPnlPct >= 0 ? "#4ade80" : "#f87171" }}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Positions table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2d3144]">
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">#</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">Asset</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Weight</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Exec Price</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Live Price</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Amount</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Allocated $</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">P&amp;L $</th>
              <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Return %</th>
            </tr>
          </thead>
          <tbody>
            {liveAssets.map((a, i) => (
              <tr key={a.id} className="border-b border-[#2d3144] hover:bg-[#ffffff04]">
                <td className="px-4 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5 text-gray-200 font-medium">
                  <span>{a.name}</span>
                  {a.isLive && (
                    <span className="ml-1.5 w-1 h-1 rounded-full bg-green-400 inline-block" />
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-purple-300 text-xs">
                  {a.weight.toFixed(2)}%
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-500 text-xs">
                  ${fmt(a.executionPrice)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs"
                  style={{ color: a.isLive ? "#f1f5f9" : "#6b7280" }}>
                  {a.isLive ? `$${fmt(a.currentPrice)}` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-500 text-xs">
                  {a.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-400 text-xs">
                  ${a.allocation.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-xs"
                  style={{ color: a.pnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
                  {a.isLive
                    ? `${a.pnlDollar >= 0 ? "+" : "−"}$${Math.abs(a.pnlDollar).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-xs"
                  style={{ color: a.totalReturn >= 0 ? "#4ade80" : "#f87171" }}>
                  {a.isLive
                    ? `${a.totalReturn >= 0 ? "+" : ""}${a.totalReturn.toFixed(2)}%`
                    : "—"}
                </td>
              </tr>
            ))}
            {/* Totals */}
            <tr className="border-t-2 border-[#3d4166] bg-[#ffffff04]">
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-gray-300 font-semibold text-xs">Total</td>
              <td className="px-4 py-2.5 text-right font-mono text-purple-300 text-xs font-medium">
                {liveAssets.reduce((s, a) => s + a.weight, 0).toFixed(1)}%
              </td>
              <td colSpan={3} />
              <td className="px-4 py-2.5 text-right font-mono text-gray-200 text-xs font-medium">
                ${totalDeployed.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-xs"
                style={{ color: totalPnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
                {hasLive
                  ? `${totalPnlDollar >= 0 ? "+" : "−"}$${Math.abs(totalPnlDollar).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                  : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-xs"
                style={{ color: totalPnlPct >= 0 ? "#4ade80" : "#f87171" }}>
                {hasLive ? `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-gray-600 px-1">
        Execution: {executionDate} · Crypto via CoinGecko · Stocks via Yahoo Finance
      </div>
    </div>
  );
}
