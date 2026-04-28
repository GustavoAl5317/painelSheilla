import { Sidebar } from "@/components/layout/sidebar";
import { DashboardOrgProvider } from "@/components/layout/org-context";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const organizationId = (session.user as { organizationId?: string }).organizationId;
  if (!organizationId) redirect("/login");

  return (
    <DashboardOrgProvider organizationId={organizationId}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </DashboardOrgProvider>
  );
}
