import React from "react";
import { MultiAgentResultsView } from "./_components/MultiAgentResultsView";

/* Route: /multi-agent/:prId?agents=a,b. The view reads useSearchParams, so it sits in Suspense. */
export default function MultiAgentResultsPage() {
  return (
    <React.Suspense fallback={null}>
      <MultiAgentResultsView />
    </React.Suspense>
  );
}
