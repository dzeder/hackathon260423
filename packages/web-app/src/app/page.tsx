import { ScenarioDashboard } from "@/components/ScenarioDashboard";
import { getDataSource } from "@/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const baseline = await getDataSource().getBaseline();
  return <ScenarioDashboard baseline={baseline} />;
}
