import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware simplificado para modo demo — reativar auth quando o banco estiver configurado.
export function middleware(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
