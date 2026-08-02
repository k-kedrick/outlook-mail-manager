import { V2Dashboard } from "@/features/dashboard/v2-dashboard";
import { requireV2AdminPage } from "@/modules/auth/presentation/next-auth";

export default async function HomePage(): Promise<React.ReactNode> {
  await requireV2AdminPage();
  return <V2Dashboard />;
}
