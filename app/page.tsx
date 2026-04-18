import { loadPerformanceData } from "@/lib/loadData";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-static";

export default function Home() {
  const data = loadPerformanceData();
  return <Dashboard data={data} />;
}
