import type { StrategyData } from "@/lib/types";

export default function WeightsDisplay({ strategies }: { strategies: Record<string, StrategyData> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {Object.entries(strategies).map(([key, strat]) => {
        const sorted = [...strat.latestWeights].sort((a, b) => b.weight - a.weight);
        return (
          <div key={key} className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm" style={{ color: strat.color }}>
                {strat.displayName}
              </h3>
              <span className="text-gray-500 text-xs">{sorted.length} assets</span>
            </div>
            <div className="space-y-2">
              {sorted.map(({ coin, weight }) => (
                <div key={coin}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-300 uppercase tracking-wide truncate mr-2">
                      {coin}
                    </span>
                    <span className="text-gray-400 font-mono shrink-0">{weight.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-[#252836] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(weight, 100)}%`,
                        background: strat.color,
                        opacity: 0.75,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
