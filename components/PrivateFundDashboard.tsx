import type { StrategyData, AssetData } from "@/lib/types";
import type { ChartPoint, MetricsSummary, AssetPerfEntry } from "@/lib/privateFundTypes";
import type { PositionsData } from "@/lib/loadPositions";
import dynamic from "next/dynamic";
import Nav from "./Nav";

const PrivateFundIndexChart = dynamic(() => import("./PrivateFundIndexChart"), { ssr: false });
const PrivateFundAssetPerf = dynamic(() => import("./PrivateFundAssetPerf"), { ssr: false });

interface Props {
  privateData: StrategyData | undefined;
  btcData: AssetData | undefined;
  allAssets: Record<string, AssetData>;
  positions: PositionsData | null;
  lastUpdated: string;
  latestRebalanceDate: string;
}

function computeMetrics(
  label: string,
  color: string,
  dailyReturns: number[],
  numDays: number,
): MetricsSummary {
  if (dailyReturns.length === 0) {
    return { label, color, totalReturn: 0, sharpe: null, maxDrawdown: 0, annReturn: 0, volatility: 0 };
  }

  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / n;
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 && n >= 30 ? parseFloat(((mean / std) * Math.sqrt(252)).toFixed(2)) : null;
  const totalReturn = parseFloat(((dailyReturns.reduce((acc, r) => acc * (1 + r), 1) - 1) * 100).toFixed(2));
  const annReturn = parseFloat((((1 + totalReturn / 100) ** (365 / numDays) - 1) * 100).toFixed(2));
  const volatility = parseFloat((std * Math.sqrt(252) * 100).toFixed(2));

  let peak = 1;
  let maxDD = 0;
  let cum = 1;
  for (const r of dailyReturns) {
    cum *= 1 + r;
    if (cum > peak) peak = cum;
    const dd = ((peak - cum) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  return { label, color, totalReturn, sharpe, maxDrawdown: parseFloat(maxDD.toFixed(2)), annReturn, volatility };
}

export default function PrivateFundDashboard({
  privateData,
  btcData,
  allAssets,
  positions,
  lastUpdated,
  latestRebalanceDate,
}: Props) {
  const positionMap = new Map((positions?.positions ?? []).map((p) => [p.id, p]));
  // --- Chart series (all normalized to base 1000) ---
  const dateMap = new Map<string, ChartPoint>();

  // Base day May 1st
  dateMap.set("2026-05-01", { date: "2026-05-01", index: 1000, combined: 1000 });

  let combinedValue = 1000;
  const indexDailyReturns: number[] = [];
  const combinedDailyReturns: number[] = [];

  if (privateData) {
    for (const d of privateData.dailyData) {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      const point = dateMap.get(d.date)!;
      point.index = d.cumReturn * 1000;
      indexDailyReturns.push(d.return);

      const cr = 0.5 * d.return;
      combinedDailyReturns.push(cr);
      combinedValue *= 1 + cr;
      point.combined = parseFloat(combinedValue.toFixed(4));
    }
  }

  if (btcData) {
    for (const d of btcData.dailyData) {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      dateMap.get(d.date)!.btc = parseFloat((d.cumReturn * 1000).toFixed(4));
    }
  }

  const chartSeries: ChartPoint[] = Array.from(dateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const numDays = privateData?.metrics?.numDays ?? indexDailyReturns.length;

  // BTC daily returns from cumReturn
  const btcDailyReturns: number[] = [];
  if (btcData && btcData.dailyData.length > 1) {
    for (let i = 1; i < btcData.dailyData.length; i++) {
      btcDailyReturns.push(btcData.dailyData[i].cumReturn / btcData.dailyData[i - 1].cumReturn - 1);
    }
  }

  const indexMetrics: MetricsSummary =
    privateData && privateData.metrics
      ? {
          label: "Private Fund Index",
          color: "#8b5cf6",
          totalReturn: privateData.metrics.totalReturn,
          sharpe: numDays >= 30 ? privateData.metrics.sharpe : null,
          maxDrawdown: privateData.metrics.maxDrawdown,
          annReturn: privateData.metrics.annReturn,
          volatility: privateData.metrics.annVolatility,
        }
      : computeMetrics("Private Fund Index", "#8b5cf6", indexDailyReturns, numDays);

  const btcMetrics = computeMetrics("Bitcoin", "#f97316", btcDailyReturns, btcDailyReturns.length || numDays);

  const combinedMetrics = computeMetrics(
    "Index + Signal (50/50)",
    "#06b6d4",
    combinedDailyReturns,
    numDays,
  );

  const allMetrics = [indexMetrics, combinedMetrics, btcMetrics];

  // --- Portfolio asset performance (anchored to execution prices) ---
  const portfolioAssets: AssetPerfEntry[] = (privateData?.latestWeights ?? [])
    .map((w) => {
      const assetData = allAssets[w.coin];
      if (!assetData || assetData.dailyData.length === 0) return null;
      const lastCumReturn = assetData.dailyData[assetData.dailyData.length - 1].cumReturn;
      const pos = positionMap.get(w.coin);
      const executionPrice = pos?.executionPrice ?? 0;
      const amount = pos?.amount ?? 0;
      const allocation = pos?.allocation ?? 0;
      // current price estimated as executionPrice × cumReturn (May 1st cumReturn = 1.0 = execution day)
      const currentPrice = executionPrice * lastCumReturn;
      const totalReturn = parseFloat(((lastCumReturn - 1) * 100).toFixed(2));
      const pnlDollar = parseFloat((allocation * (lastCumReturn - 1)).toFixed(2));
      const displayName = assetData.displayName || w.coin.toUpperCase();
      return {
        id: w.coin,
        name: displayName,
        weight: w.weight,
        totalReturn,
        executionPrice,
        currentPrice: parseFloat(currentPrice.toFixed(executionPrice < 1 ? 6 : executionPrice < 10 ? 4 : 2)),
        amount,
        allocation,
        pnlDollar,
      };
    })
    .filter(Boolean) as AssetPerfEntry[];

  // Weekly top movers — sorted by return
  const topMovers = [...portfolioAssets].sort((a, b) => b.totalReturn - a.totalReturn);

  const totalDeployed = positions?.totalDeployed ?? 0;
  const totalPnlDollar = portfolioAssets.reduce((s, a) => s + a.pnlDollar, 0);
  const totalPnlPct = totalDeployed > 0 ? (totalPnlDollar / totalDeployed) * 100 : 0;
  const currentPortfolioValue = totalDeployed + totalPnlDollar;

  const hasData = !!privateData;

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <header className="border-b border-[#2d3144] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Private Fund Strategy</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              {lastUpdated && (
                <div className="text-gray-400">
                  Updated <span className="text-white font-medium">{lastUpdated}</span>
                </div>
              )}
              {latestRebalanceDate && (
                <div className="text-gray-400">
                  Last rebalance <span className="text-white font-medium">{latestRebalanceDate}</span>
                </div>
              )}
            </div>
            <Nav />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {!hasData ? (
          <div className="text-center py-24 text-gray-400">No performance data yet.</div>
        ) : (
          <>
            {/* Portfolio dollar summary */}
            {positions && (
              <section>
                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144] flex flex-wrap gap-6">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Deployed Capital</div>
                    <div className="text-xl font-bold text-white font-mono">
                      ${totalDeployed.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Current Value</div>
                    <div className="text-xl font-bold text-white font-mono">
                      ${currentPortfolioValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total P&amp;L</div>
                    <div className="text-xl font-bold font-mono" style={{ color: totalPnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
                      {totalPnlDollar >= 0 ? "+" : ""}${Math.abs(totalPnlDollar).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Return %</div>
                    <div className="text-xl font-bold font-mono" style={{ color: totalPnlPct >= 0 ? "#4ade80" : "#f87171" }}>
                      {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 self-end ml-auto">
                    execution: {positions.executionDate}
                  </div>
                </div>
              </section>
            )}

            {/* Metric cards */}
            <section>
              <SectionHeader title="Performance Comparison" subtitle="since May 1, 2026 · base 1000" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {allMetrics.map((m) => (
                  <div
                    key={m.label}
                    className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]"
                    style={{ borderLeftWidth: 3, borderLeftColor: m.color }}
                  >
                    <div className="text-xs mb-1" style={{ color: m.color }}>
                      {m.label}
                    </div>
                    <div
                      className="text-2xl font-bold"
                      style={{ color: m.totalReturn >= 0 ? "#4ade80" : "#f87171" }}
                    >
                      {m.totalReturn >= 0 ? "+" : ""}
                      {m.totalReturn.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Total Return</div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <div className="text-gray-500">Sharpe</div>
                        <div className="text-white font-mono font-medium">
                          {m.sharpe?.toFixed(2) ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Max DD</div>
                        <div className="text-red-400 font-mono font-medium">
                          {m.maxDrawdown > 0 ? `-${m.maxDrawdown.toFixed(2)}%` : "0%"}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Ann. Return</div>
                        <div
                          className="font-mono font-medium"
                          style={{ color: m.annReturn >= 0 ? "#4ade80" : "#f87171" }}
                        >
                          {m.annReturn >= 0 ? "+" : ""}
                          {m.annReturn.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Ann. Vol</div>
                        <div className="text-gray-300 font-mono font-medium">{m.volatility.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Index 1000 chart */}
            <section>
              <SectionHeader
                title="Index Performance (Base 1000)"
                subtitle="Private Fund Index vs BTC vs Index+Signal"
              />
              <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]">
                <PrivateFundIndexChart chartSeries={chartSeries} />
              </div>
            </section>

            {/* Metrics comparison table */}
            <section>
              <SectionHeader title="Metrics Comparison" />
              <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2d3144]">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Metric</th>
                      {allMetrics.map((m) => (
                        <th
                          key={m.label}
                          className="text-right px-4 py-3 font-medium"
                          style={{ color: m.color }}
                        >
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "Total Return",
                        fmt: (m: MetricsSummary) =>
                          `${m.totalReturn >= 0 ? "+" : ""}${m.totalReturn.toFixed(2)}%`,
                        color: (m: MetricsSummary) => (m.totalReturn >= 0 ? "#4ade80" : "#f87171"),
                      },
                      {
                        label: "Ann. Return",
                        fmt: (m: MetricsSummary) =>
                          `${m.annReturn >= 0 ? "+" : ""}${m.annReturn.toFixed(1)}%`,
                        color: (m: MetricsSummary) => (m.annReturn >= 0 ? "#4ade80" : "#f87171"),
                      },
                      {
                        label: "Sharpe Ratio",
                        fmt: (m: MetricsSummary) => m.sharpe?.toFixed(2) ?? "—",
                        color: () => "#d1d5db",
                      },
                      {
                        label: "Max Drawdown",
                        fmt: (m: MetricsSummary) =>
                          m.maxDrawdown > 0 ? `-${m.maxDrawdown.toFixed(2)}%` : "0%",
                        color: () => "#f87171",
                      },
                      {
                        label: "Ann. Volatility",
                        fmt: (m: MetricsSummary) => `${m.volatility.toFixed(1)}%`,
                        color: () => "#9ca3af",
                      },
                    ].map((row) => (
                      <tr key={row.label} className="border-b border-[#2d3144] hover:bg-[#ffffff04]">
                        <td className="px-4 py-2.5 text-gray-400">{row.label}</td>
                        {allMetrics.map((m) => (
                          <td
                            key={m.label}
                            className="px-4 py-2.5 text-right font-mono font-medium"
                            style={{ color: row.color(m) }}
                          >
                            {row.fmt(m)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Individual asset performance */}
            {portfolioAssets.length > 0 && (
              <section>
                <SectionHeader
                  title="Individual Asset Performance"
                  subtitle="portfolio holdings · % return since May 1"
                />
                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]">
                  <PrivateFundAssetPerf assets={portfolioAssets} />
                </div>
              </section>
            )}

            {/* Weekly top movers */}
            {topMovers.length > 0 && (
              <section>
                <SectionHeader
                  title="Top Movers Within Signal"
                  subtitle="private fund holdings · ranked by return since May 1"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Top gainers */}
                  <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#2d3144] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="text-sm font-medium text-green-400">Top Gainers</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2d3144]">
                          <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">#</th>
                          <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Asset</th>
                          <th className="text-right px-4 py-2 text-gray-500 font-medium text-xs">Weight</th>
                          <th className="text-right px-4 py-2 text-gray-500 font-medium text-xs">P&amp;L $</th>
                          <th className="text-right px-4 py-2 text-gray-500 font-medium text-xs">Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topMovers.slice(0, 7).map((a, i) => (
                          <tr key={a.id} className="border-b border-[#2d3144] hover:bg-[#ffffff04]">
                            <td className="px-4 py-2 text-gray-600 text-xs">{i + 1}</td>
                            <td className="px-4 py-2 text-gray-200">{a.name}</td>
                            <td className="px-4 py-2 text-right text-gray-400 font-mono text-xs">
                              {a.weight.toFixed(1)}%
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-xs"
                              style={{ color: a.pnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
                              {a.pnlDollar >= 0 ? "+" : ""}${Math.abs(a.pnlDollar).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </td>
                            <td
                              className="px-4 py-2 text-right font-mono font-medium"
                              style={{ color: a.totalReturn >= 0 ? "#4ade80" : "#f87171" }}
                            >
                              {a.totalReturn >= 0 ? "+" : ""}
                              {a.totalReturn.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottom performers */}
                  <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#2d3144] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="text-sm font-medium text-red-400">Laggards</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2d3144]">
                          <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">#</th>
                          <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Asset</th>
                          <th className="text-right px-4 py-2 text-gray-500 font-medium text-xs">Weight</th>
                          <th className="text-right px-4 py-2 text-gray-500 font-medium text-xs">P&amp;L $</th>
                          <th className="text-right px-4 py-2 text-gray-500 font-medium text-xs">Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...topMovers].reverse().slice(0, 7).map((a, i) => (
                          <tr key={a.id} className="border-b border-[#2d3144] hover:bg-[#ffffff04]">
                            <td className="px-4 py-2 text-gray-600 text-xs">{i + 1}</td>
                            <td className="px-4 py-2 text-gray-200">{a.name}</td>
                            <td className="px-4 py-2 text-right text-gray-400 font-mono text-xs">
                              {a.weight.toFixed(1)}%
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-xs"
                              style={{ color: a.pnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
                              {a.pnlDollar >= 0 ? "+" : ""}${Math.abs(a.pnlDollar).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </td>
                            <td
                              className="px-4 py-2 text-right font-mono font-medium"
                              style={{ color: a.totalReturn >= 0 ? "#4ade80" : "#f87171" }}
                            >
                              {a.totalReturn >= 0 ? "+" : ""}
                              {a.totalReturn.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* Positions table */}
            {portfolioAssets.length > 0 && (
              <section>
                <SectionHeader title="Positions" subtitle={`execution ${positions?.executionDate ?? latestRebalanceDate}`} />
                <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2d3144]">
                        <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">#</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs">Asset</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs">Weight</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs">Exec Price</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs">Curr Price</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs">Amount</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs">Allocated $</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs">P&amp;L $</th>
                        <th className="text-right px-4 py-3 text-gray-400 font-medium text-xs">Return %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioAssets.map((a, i) => (
                        <tr key={a.id} className="border-b border-[#2d3144] hover:bg-[#ffffff04]">
                          <td className="px-4 py-2.5 text-gray-600 text-xs">{i + 1}</td>
                          <td className="px-4 py-2.5 text-gray-200 font-medium">{a.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-purple-300 text-xs">
                            {a.weight.toFixed(2)}%
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-400 text-xs">
                            ${a.executionPrice.toLocaleString("en-US", { minimumFractionDigits: a.executionPrice < 1 ? 4 : 2, maximumFractionDigits: a.executionPrice < 1 ? 4 : 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-200 text-xs">
                            ${a.currentPrice.toLocaleString("en-US", { minimumFractionDigits: a.currentPrice < 1 ? 4 : 2, maximumFractionDigits: a.currentPrice < 1 ? 4 : 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-400 text-xs">
                            {a.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-300 text-xs">
                            ${a.allocation.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-xs"
                            style={{ color: a.pnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
                            {a.pnlDollar >= 0 ? "+" : ""}${Math.abs(a.pnlDollar).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-xs"
                            style={{ color: a.totalReturn >= 0 ? "#4ade80" : "#f87171" }}>
                            {a.totalReturn >= 0 ? "+" : ""}{a.totalReturn.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="border-t-2 border-[#3d4166] bg-[#ffffff04]">
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 text-gray-300 font-semibold text-xs">Total</td>
                        <td className="px-4 py-2.5 text-right font-mono text-purple-300 text-xs font-medium">
                          {portfolioAssets.reduce((s, a) => s + a.weight, 0).toFixed(1)}%
                        </td>
                        <td colSpan={3} />
                        <td className="px-4 py-2.5 text-right font-mono text-gray-200 text-xs font-medium">
                          ${totalDeployed.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-xs"
                          style={{ color: totalPnlDollar >= 0 ? "#4ade80" : "#f87171" }}>
                          {totalPnlDollar >= 0 ? "+" : ""}${Math.abs(totalPnlDollar).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-xs"
                          style={{ color: totalPnlPct >= 0 ? "#4ade80" : "#f87171" }}>
                          {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <span className="text-sm text-gray-500">{subtitle}</span>}
    </div>
  );
}
