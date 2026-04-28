import { NextRequest, NextResponse } from "next/server";
import { syncDJEN } from "@/lib/djen-sync";

export async function POST(req: NextRequest) {
  try {
    const { organizationId } = await req.json();
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId obrigatório" }, { status: 400 });
    }
    const result = await syncDJEN(organizationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
