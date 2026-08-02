import { Dashboard } from "@/components/dashboard";
import { requireAuthPage } from "@/lib/auth";

export default async function HomePage(): Promise<React.ReactNode> {
  await requireAuthPage();
  return <Dashboard />;
}
