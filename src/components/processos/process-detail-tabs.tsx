"use client";

import { ProcessCrmCard } from "./process-crm-card";

interface Props {
  processId: string;
  processNumber: string | null;
  clientId: string | null;
  lastDjenSearchAt: string | null;
}

export function ProcessDetailTabs({ processId, processNumber, clientId, lastDjenSearchAt }: Props) {
  return (
    <ProcessCrmCard
      processId={processId}
      processNumber={processNumber}
      clientId={clientId}
      lastDjenSearchAt={lastDjenSearchAt}
    />
  );
}
