import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const data = await getDashboardData(orgId);

  return NextResponse.json({ data });
}
