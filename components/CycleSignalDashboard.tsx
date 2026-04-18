import type { CycleSignalData } from "@/lib/types";
import dynamic from "next/dynamic";
import Nav from "./Nav";

const ExposureHistoryChart = dynamic(() => import("./ExposureHistoryChart"), { ssr: false });
const SignalBreakdownChart = dynamic(() => import("./SignalBreakdownChart"), { ssr: false });
const DominantPairsChart = dynamic(() => import("./DominantPairsChart"), { ssr: false });

function dirColor(d: string) {
  if (d === "BULLISH") return "#00b894";
  if (d === "BEARISH") return "#e17055";
  return "#9ca3af";
}
function riskColor(r: string) {
  if (r === "LOW") return "#00b894";
  if (r === "HIGH") return "#e17055";
  return "#fdcb6e";
}
function volColor(r: string) {
  if (r === "LOW") return "#74b9ff";
  if (r === "HIGH") return "#fdcb6e";
  if (r === "EXTREME") return "#e17055";
  return "#9ca3af";
}
function expColor(e: number) {
  if (e >= 0.65) return "#00b894";
  if (e <= 0.35) return "#e17055";
  return "#fdcb6e";
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <span className="text-sm text-gray-500">{subtitle}</span>}
    </div>
  );
}

export default function CycleSignalDashboard({ data }: { data: CycleSignalData }) {
  const { state, history } = data;

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <header className="border-b border-[#2d3144] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cycle Signal</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              BTC On-Chain · Technical Regime Model
            </p>
          </div>
          <div className="flex items-center gap-4">
            {state && (
              <div className="text-right text-sm text-gray-400">
                Last run&nbsp;
                <span className="text-white font-medium">{state.date}</span>
              </div>
            )}
            <Nav />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {!state ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">No CycleSignal data yet.</p>
            <p className="text-gray-600 text-sm mt-2">
              Run <code className="text-gray-400">cs_morning_report_v2_2_2.py</code> and save
              output to <code className="text-gray-400">data/cycle_state.json</code>.
            </p>
          </div>
        ) : (
          <>
            {/* Cache / data warnings */}
            {state.cache_warnings.length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-3">
                <div className="text-yellow-400 text-xs font-semibold mb-1">Data Source Warnings</div>
                {state.cache_warnings.map((w, i) => (
                  <div key={i} className="text-yellow-300/80 text-xs">{w}</div>
                ))}
              </div>
            )}

            {/* Status cards */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]" style={{ borderLeftWidth: 3, borderLeftColor: "#f7931a" }}>
                  <div className="text-xs text-gray-400 mb-1">BTC Price</div>
                  <div className="text-2xl font-bold font-mono text-[#f7931a]">
                    ${state.btc_price.toLocaleString()}
                  </div>
                </div>

                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]"
                  style={{ borderLeftWidth: 3, borderLeftColor: expColor(state.exposure) }}>
                  <div className="text-xs text-gray-400 mb-1">BTC Exposure</div>
                  <div className="text-2xl font-bold font-mono" style={{ color: expColor(state.exposure) }}>
                    {(state.exposure * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs mt-1 font-medium" style={{ color: dirColor(state.direction) }}>
                    {state.direction}
                  </div>
                </div>

                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]"
                  style={{ borderLeftWidth: 3, borderLeftColor: state.composite < 0 ? "#00b894" : state.composite > 0 ? "#e17055" : "#4b5563" }}>
                  <div className="text-xs text-gray-400 mb-1">Composite</div>
                  <div className="text-2xl font-bold font-mono"
                    style={{ color: state.composite < 0 ? "#00b894" : state.composite > 0 ? "#e17055" : "#9ca3af" }}>
                    {state.composite >= 0 ? "+" : ""}{state.composite.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Gate: {state.gate.toFixed(3)}</div>
                </div>

                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]"
                  style={{ borderLeftWidth: 3, borderLeftColor: volColor(state.vol_regime) }}>
                  <div className="text-xs text-gray-400 mb-1">Vol Regime</div>
                  <div className="text-xl font-bold" style={{ color: volColor(state.vol_regime) }}>
                    {state.vol_regime}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">z = {state.vol_z.toFixed(2)}</div>
                </div>

                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]"
                  style={{ borderLeftWidth: 3, borderLeftColor: riskColor(state.risk_level) }}>
                  <div className="text-xs text-gray-400 mb-1">Risk Level</div>
                  <div className="text-xl font-bold" style={{ color: riskColor(state.risk_level) }}>
                    {state.risk_level}
                  </div>
                  {state.risk_factors[0] && (
                    <div className="text-xs text-gray-500 mt-1 leading-tight line-clamp-2">
                      {state.risk_factors[0]}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Signal breakdown + Dominant pairs */}
            <section>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <SectionHeader
                    title="Signal Breakdown"
                    subtitle={`${state.bull_count + state.neut_count + state.bear_count} signals`}
                  />
                  <div className="bg-[#1a1d29] rounded-xl p-5 border border-[#2d3144]">
                    <SignalBreakdownChart
                      bullCount={state.bull_count}
                      neutCount={state.neut_count}
                      bearCount={state.bear_count}
                      bullSignals={state.bull_signals}
                      bearSignals={state.bear_signals}
                    />
                  </div>
                </div>
                <div>
                  <SectionHeader title="Dominant Signal Pairs" subtitle="hover for details · brighter = both windows" />
                  <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]">
                    <DominantPairsChart pairs={state.dominant_pairs} />
                  </div>
                </div>
              </div>
            </section>

            {/* Historical exposure + composite */}
            {history.length > 0 && (
              <section>
                <SectionHeader title="Historical Exposure & Composite" />
                <div className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]">
                  <ExposureHistoryChart history={history} />
                </div>
              </section>
            )}

            {/* Signal flips */}
            {state.flips.length > 0 && (
              <section>
                <SectionHeader title="Signal Flips Today" subtitle={`${state.flips.length} changed`} />
                <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-hidden">
                  <div className="grid grid-cols-3 px-4 py-2 text-xs text-gray-500 border-b border-[#2d3144] font-medium uppercase tracking-wide">
                    <span>Signal</span><span>From</span><span>To</span>
                  </div>
                  {state.flips.map((f, i) => (
                    <div key={i} className="grid grid-cols-3 px-4 py-2.5 text-sm border-b border-[#2d3144]/40 last:border-0 hover:bg-[#2d3144]/30">
                      <span className="text-gray-300 font-mono text-xs">{f.signal}</span>
                      <span className="text-xs" style={{ color: f.from === "BULL" ? "#00b894" : f.from === "BEAR" ? "#e17055" : "#6b7280" }}>
                        {f.from}
                      </span>
                      <span className="text-xs font-medium" style={{ color: f.to === "BULL" ? "#00b894" : f.to === "BEAR" ? "#e17055" : "#6b7280" }}>
                        → {f.to}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Individual signal lists (if enriched state) */}
            {(state.bull_signals?.length || state.bear_signals?.length) && (
              <section>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {state.bull_signals && state.bull_signals.length > 0 && (
                    <div>
                      <SectionHeader title="Bullish Signals" subtitle={`${state.bull_signals.length}`} />
                      <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-hidden">
                        <div className="grid grid-cols-2 gap-1 p-3 max-h-56 overflow-y-auto">
                          {state.bull_signals.map((s) => (
                            <div key={s} className="text-xs font-mono text-green-400/80 px-1.5 py-0.5 rounded bg-green-900/20 truncate">
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {state.bear_signals && state.bear_signals.length > 0 && (
                    <div>
                      <SectionHeader title="Bearish Signals" subtitle={`${state.bear_signals.length}`} />
                      <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-hidden">
                        <div className="grid grid-cols-2 gap-1 p-3 max-h-56 overflow-y-auto">
                          {state.bear_signals.map((s) => (
                            <div key={s} className="text-xs font-mono text-red-400/80 px-1.5 py-0.5 rounded bg-red-900/20 truncate">
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Cooldowns + Risk factors */}
            {(state.cooldown_events.length > 0 || state.risk_factors.length > 0) && (
              <section>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {state.cooldown_events.length > 0 && (
                    <div>
                      <SectionHeader title="Active Cooldowns" />
                      <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-hidden">
                        {state.cooldown_events.map((cd, i) => (
                          <div key={i} className="px-4 py-3 border-b border-[#2d3144]/40 last:border-0">
                            <div className="flex justify-between items-start gap-2">
                              <div className="text-sm text-gray-200">{cd.blocked_move}</div>
                              <div className="text-xs text-yellow-400 shrink-0">{cd.remaining_days}d left</div>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{cd.date}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {state.risk_factors.length > 0 && (
                    <div>
                      <SectionHeader title="Risk Factors" />
                      <div className="bg-[#1a1d29] rounded-xl border border-[#2d3144] overflow-hidden">
                        {state.risk_factors.map((rf, i) => (
                          <div key={i} className="px-4 py-3 border-b border-[#2d3144]/40 last:border-0 text-sm text-yellow-300/80">
                            {rf}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
