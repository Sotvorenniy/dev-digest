import type { Severity } from "@devdigest/ui";

/**
 * The three wire severities, worst first. `@devdigest/ui`'s `Severity` also has
 * `INFO`, but the findings contract (`contracts/findings.ts`) only ever emits
 * these three, so counting or filtering by INFO would be counting nothing.
 */
export const WIRE_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies readonly Severity[];

export type WireSeverity = (typeof WIRE_SEVERITIES)[number];

/** Per-severity tallies, as both the PR list and the run timeline pass them. */
export type SeverityCounts = Partial<Record<string, number>>;
