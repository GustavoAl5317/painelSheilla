"use client";

import { createContext, useContext, type ReactNode } from "react";

type OrgContextValue = { organizationId: string };

const OrgContext = createContext<OrgContextValue | null>(null);

export function DashboardOrgProvider({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  return <OrgContext.Provider value={{ organizationId }}>{children}</OrgContext.Provider>;
}

export function useDashboardOrg() {
  const v = useContext(OrgContext);
  if (!v) throw new Error("useDashboardOrg must be used within DashboardOrgProvider");
  return v;
}

/** Seguro fora do provider: retorna null. */
export function useDashboardOrgOptional() {
  return useContext(OrgContext);
}
