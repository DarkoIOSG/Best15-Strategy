import type { StrategyData } from "@/lib/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function cellBg(v: number | undefined): string {
  if (v === undefined) return "transparent";
  if (v > 20)  return "#14532d";
  if (v > 10)  return "#166534";
  if (v > 5)   return "#15803d";
  if (v > 2)   return "#16a34a";
  if (v > 0)   return "#22c55e";
  if (v > -2)  return "#f87171";
  if (v > -5)  return "#ef4444";
  if (v > -10) return "#dc2626";
  if (v > -20) return "#b91c1c";
  return "#7f1d1d";
}

function cellText(v: number | undefined): string {
  if (v === undefined) return "";
  return v.toFixed(1);
}

export default function MonthlyHeatmap({ strategies }: { strategies: Record<string, StrategyData> }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {Object.entries(strategies).map(([key, strat]) => {
        const yearMap: Record<number, Record<number, number>> = {};
        for (const { year, month, return: ret } of strat.monthlyReturns) {
          if (!yearMap[year]) yearMap[year] = {};
          yearMap[year][month] = ret;
        }
        const years = Object.keys(yearMap).map(Number).sort();

        return (
          <div key={key} className="bg-[#1a1d29] rounded-xl p-4 border border-[#2d3144]">
            <h3 className="font-semibold text-sm mb-3" style={{ color: strat.color }}>
              {strat.displayName}
            </h3>

            {years.length === 0 ? (
              <p className="text-gray-600 text-xs">Not enough data for monthly view.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-gray-500 text-left py-1 pr-2 font-medium w-10">Year</th>
                      {MONTHS.map((m) => (
                        <th key={m} className="text-gray-500 text-center py-1 px-0.5 font-medium w-10">
                          {m}
                        </th>
                      ))}
                      <th className="text-gray-500 text-right py-1 pl-2 font-medium w-14">YTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((year) => {
                      const row = yearMap[year];
                      const ytdFactor = Object.values(row).reduce(
                        (acc, r) => acc * (1 + r / 100),
                        1
                      );
                      const ytd = (ytdFactor - 1) * 100;
                      return (
                        <tr key={year}>
                          <td className="text-gray-300 py-0.5 pr-2 font-medium">{year}</td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const v = row[i + 1];
                            return (
                              <td key={i} className="py-0.5 px-0.5">
                                <div
                                  className="rounded text-center py-1 font-mono text-white"
                                  style={{
                                    background: cellBg(v),
                                    minWidth: "2rem",
                                    opacity: v !== undefined ? 1 : 0.15,
                                  }}
                                >
                                  {cellText(v)}
                                </div>
                              </td>
                            );
                          })}
                          <td
                            className="py-0.5 pl-2 text-right font-mono font-medium"
                            style={{ color: ytd >= 0 ? "#4ade80" : "#f87171" }}
                          >
                            {ytd >= 0 ? "+" : ""}{ytd.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
