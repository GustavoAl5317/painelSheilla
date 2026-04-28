import { NextRequest, NextResponse } from "next/server";
import { syncPJeCommunications } from "@/lib/pje-sync";

// Can be triggered manually from the UI or by a cron job
export async function POST(req: NextRequest) {
  try {
    const { organizationId } = await req.json();
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 });
    }

    const result = await syncPJeCommunications(organizationId);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: "Sync failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
