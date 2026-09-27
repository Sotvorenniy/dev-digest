import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";

afterEach(cleanup);

function pr(over: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    findings_critical: 2,
    findings_warning: 2,
    findings_suggestion: 2,
    findings_preview: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded Stripe secret key in commit",
        file: "src/config.ts",
        start_line: 12,
        end_line: 12,
        confidence: 0.98,
        rationale: "Line 12 contains a literal string starting with sk_live_.",
      },
    ],
    total_cost_usd: 0.014,
    ...over,
  };
}

function renderCell(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell pr={meta} />
    </NextIntlClientProvider>,
  );
}

/** The hover trigger the popover wraps around the severity chips. */
function trigger(): HTMLElement {
  return document.querySelector("[data-findings-trigger]") as HTMLElement;
}

describe("FindingsCell", () => {
  it("shows the severity breakdown from the list payload", () => {
    const { container } = renderCell(pr());
    expect(container.textContent).toContain("2");
  });

  it("opens the preview on hover", () => {
    renderCell(pr());
    expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger());
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
  });

  it("renders an em dash and no preview for a PR that was never reviewed", () => {
    renderCell(
      pr({
        score: null,
        findings_critical: null,
        findings_warning: null,
        findings_suggestion: null,
        findings_preview: null,
      }),
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    fireEvent.mouseEnter(trigger());
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
  });

  it("renders an em dash for a reviewed PR that found nothing", () => {
    renderCell(
      pr({ findings_critical: 0, findings_warning: 0, findings_suggestion: 0, findings_preview: [] }),
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
