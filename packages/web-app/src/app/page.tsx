import { ScenarioDashboard } from "@/components/ScenarioDashboard";
import { getDataSource } from "@/data";
import { getEventsCatalog } from "@/lib/eventsCatalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [baseline, events] = await Promise.all([
    getDataSource().getBaseline(),
    getEventsCatalog(),
  ]);
  return <ScenarioDashboard baseline={baseline} events={events} />;
}
