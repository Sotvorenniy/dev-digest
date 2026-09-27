import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "c1", severity: "CRITICAL", title: "Hardcoded secret" }),
  finding({ id: "c2", severity: "CRITICAL", title: "Exfil path" }),
  finding({ id: "w1", severity: "WARNING", title: "N+1 query" }),
  finding({ id: "s1", severity: "SUGGESTION", title: "Magic number 3600" }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The counter pills, keyed by severity. */
function pillCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const el of document.querySelectorAll("[data-severity-pill]")) {
    const sev = el.getAttribute("data-severity-pill")!;
    out[sev] = Number(el.textContent!.replace(/\D+/g, ""));
  }
  return out;
}

/** How many finding cards are rendered. */
function cardCount(): number {
  return document.querySelectorAll("[data-finding-id]").length;
}

/** The interactive severity filter button (a Chip), not the counter pill. */
function filterChip(label: string): HTMLButtonElement {
  return screen
    .getAllByText(label)
    .map((el) => el.closest("button"))
    .find((b): b is HTMLButtonElement => b !== null)!;
}

describe("FindingsPanel", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("counter pills match the finding cards rendered below", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(pillCounts()).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    expect(cardCount()).toBe(4);
  });

  it("only shows pills for severities that are actually present", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[2]!]} prId="pr1" />);
    expect(pillCounts()).toEqual({ WARNING: 1 });
  });

  it("filters to one severity, and un-filters on a second click", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const criticalChip = filterChip("Critical");

    fireEvent.click(criticalChip);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Exfil path")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
    expect(screen.queryByText("Magic number 3600")).not.toBeInTheDocument();
    // Pills track what is on screen, so the filtered-out ones leave too.
    expect(pillCounts()).toEqual({ CRITICAL: 2 });

    fireEvent.click(criticalChip);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Magic number 3600")).toBeInTheDocument();
    expect(pillCounts()).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("keeps the run's totals on the filter buttons while a filter is active", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const criticalChip = filterChip("Critical");
    fireEvent.click(criticalChip);
    const warningChip = filterChip("Warning");
    // Still advertises the 1 warning you can switch to, rather than reading 0.
    expect(warningChip.textContent).toContain("1");
  });
});
