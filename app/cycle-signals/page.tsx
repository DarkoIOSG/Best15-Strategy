import { loadCycleData } from "@/lib/loadCycleData";
import CycleSignalDashboard from "@/components/CycleSignalDashboard";

export const dynamic = "force-static";

export default function CycleSignalsPage() {
  const data = loadCycleData();
  return <CycleSignalDashboard data={data} />;
}
