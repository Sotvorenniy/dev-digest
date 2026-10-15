import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import type { PrBrief } from "@/lib/types";
import { ApiError } from "@/lib/api";
import brief from "../../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";

interface BriefQuery {
  data?: PrBrief | null;
  isLoading: boolean;
}
interface GenState {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}
let query: BriefQuery;
let gen: GenState;
const mutate = vi.fn();

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => query,
  useGenerateBrief: () => ({ ...gen, mutate }),
}));

import { PrBriefCard } from "./PrBriefCard";

const BRIEF: PrBrief = {
  summary: "Adds a rate limiter to the public API.",
  intent: null,
  blast: null,
  risks: {
    risks: [
      { kind: "config", title: "Hard-coded limits", explanation: "Tuning needs a deploy.", severity: "high", file_refs: ["src/config.ts:10-13"] },
      { kind: "behavior", title: "Users depend on limiter", explanation: "", severity: "low", file_refs: ["src/api/users.ts"] },
    ],
  },
  review_focus: [
    { file: "src/config.ts", line: 12, reason: "Check the maximum." },
    { file: "src/api/users.ts", line: 3, reason: "Identity passed through." },
  ],
  head_sha: "sha-1",
  generated_at: "2026-01-01T00:00:00.000Z",
  missing_inputs: [],
  specs_used: [],
  model: "m",
  tokens_in: 1200,
  tokens_out: 300,
  cost_usd: 0.0123,
};

const REVIEW = (over: Record<string, unknown> = {}) =>
  ({ id: "rv", verdict: "request_changes", score: 61, findings: [], ...over }) as unknown as ReviewRecord;

function renderCard(props: Partial<React.ComponentProps<typeof PrBriefCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
      <PrBriefCard prId="p1" repoId="r1" prNumber={482} headSha="sha-1" hasFiles {...props} />
    </NextIntlClientProvider>,
  );
}

const status = (c: HTMLElement) => c.querySelector('[aria-live="polite"][data-brief-status]') as HTMLElement;

afterEach(() => {
  cleanup();
  mutate.mockReset();
  gen = { isPending: false, isError: false, error: null };
});
gen = { isPending: false, isError: false, error: null };

describe("PrBriefCard — no brief", () => {
  it("AC1: offers Generate with the empty message; clicking it generates", () => {
    query = { data: null, isLoading: false };
    renderCard();
    expect(screen.getByText(brief.empty)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: brief.generate }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC16: a PR without files shows the no-files text and a disabled Generate", () => {
    query = { data: null, isLoading: false };
    renderCard({ hasFiles: false });
    expect(screen.getByText(brief.emptyPr)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: brief.generate })).toBeDisabled();
  });

  it("shows a skeleton, not the empty state, while loading", () => {
    query = { data: undefined, isLoading: true };
    renderCard();
    expect(screen.queryByText(brief.empty)).toBeNull();
    expect(screen.queryByRole("button", { name: brief.generate })).toBeNull();
  });

  it("AC12: while generating, Generate is disabled and the live region says so", () => {
    query = { data: null, isLoading: false };
    gen = { isPending: true, isError: false, error: null };
    const { container } = renderCard();
    expect(screen.getByRole("button", { name: new RegExp(brief.generate) })).toBeDisabled();
    expect(status(container)).toHaveTextContent(brief.generating);
  });
});

describe("PrBriefCard — shown brief", () => {
  it("AC1/AC7: renders the summary, risk titles with a severity label, and the cost/tokens line", () => {
    query = { data: BRIEF, isLoading: false };
    const { container } = renderCard();
    expect(screen.getByText(BRIEF.summary!)).toBeInTheDocument();
    expect(screen.getByText("Hard-coded limits")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: brief.severity.high })).toHaveAttribute("data-risk-severity", "high");
    expect(screen.getByRole("img", { name: brief.severity.low })).toHaveAttribute("data-risk-severity", "low");
    expect(screen.getByText("src/config.ts:10-13")).toBeInTheDocument();
    expect(container.querySelector("[data-brief-meta]")!.textContent).toContain("1200 → 300 tokens");
    expect(screen.queryByRole("button", { name: brief.generate })).toBeNull();
  });

  it("AC7: a risk explanation is collapsed until its toggle is opened", () => {
    query = { data: BRIEF, isLoading: false };
    renderCard();
    expect(screen.queryByText("Tuning needs a deploy.")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show explanation for Hard-coded limits" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Tuning needs a deploy.")).toBeInTheDocument();
    // a risk without an explanation has no toggle
    expect(screen.queryByRole("button", { name: "Show explanation for Users depend on limiter" })).toBeNull();
  });

  it("AC8: review focus items are links into the diff tab at the line", () => {
    query = { data: BRIEF, isLoading: false };
    renderCard();
    const link = screen.getByRole("link", { name: "Open src/config.ts line 12 in the diff" });
    expect(link).toHaveAttribute("href", "/repos/r1/pulls/482?tab=diff&file=src%2Fconfig.ts&line=12");
    expect(screen.getByText("Check the maximum.")).toBeInTheDocument();
  });

  it("AC8: a focus item with an unusable line is plain text, not a link", () => {
    query = {
      data: { ...BRIEF, review_focus: [{ file: "src/x.ts", line: 0, reason: "odd" }] },
      isLoading: false,
    };
    renderCard();
    expect(screen.getByText("src/x.ts:0")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("AC9: Refresh regenerates", () => {
    query = { data: BRIEF, isLoading: false };
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: brief.refresh }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC10: a head SHA different from the brief's shows the stale warning; equal does not", () => {
    query = { data: BRIEF, isLoading: false };
    const { container, rerender } = renderCard({ headSha: "sha-2" });
    expect(status(container)).toHaveTextContent(brief.stale);
    rerender(
      <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
        <PrBriefCard prId="p1" repoId="r1" prNumber={482} headSha="sha-1" hasFiles />
      </NextIntlClientProvider>,
    );
    expect(status(container)).not.toHaveTextContent(brief.stale);
  });

  it("AC11: missing inputs are listed with their reasons", () => {
    query = {
      data: {
        ...BRIEF,
        missing_inputs: [
          { input: "intent", reason: "stale" },
          { input: "blast", reason: "degraded" },
        ],
      },
      isLoading: false,
    };
    const { container } = renderCard();
    const text = container.querySelector("[data-brief-missing]")!.textContent!;
    expect(text).toContain(brief.missing.title);
    expect(text).toContain("intent (out of date)");
    expect(text).toContain("blast radius (partial)");
  });

  it("AC11: no missing-inputs note when nothing is missing", () => {
    query = { data: BRIEF, isLoading: false };
    const { container } = renderCard();
    expect(container.querySelector("[data-brief-missing]")).toBeNull();
  });

  it("shows the no-risks line when the brief has none", () => {
    query = { data: { ...BRIEF, risks: { risks: [] } }, isLoading: false };
    renderCard();
    expect(screen.getByText(brief.noRisks)).toBeInTheDocument();
  });
});

describe("PrBriefCard — errors (AC14)", () => {
  const withError = (err: unknown) => {
    gen = { isPending: false, isError: true, error: err };
  };

  it("generic: message and a Retry that regenerates", () => {
    query = { data: null, isLoading: false };
    withError(new ApiError("boom", 502));
    const { container } = renderCard();
    const region = status(container);
    expect(region).toHaveTextContent(brief.error.generic);
    expect(region.querySelector("[data-brief-error='generic']")).not.toBeNull();
    fireEvent.click(within(region).getByRole("button", { name: brief.retry }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("no key: message plus a link to settings", () => {
    query = { data: null, isLoading: false };
    withError(new ApiError("no key", 500, "config_error"));
    const { container } = renderCard();
    expect(status(container)).toHaveTextContent(brief.error.noKey);
    expect(screen.getByRole("link", { name: brief.settingsLink })).toHaveAttribute("href", "/settings");
  });

  it("rate limited: its own message", () => {
    query = { data: null, isLoading: false };
    withError(new ApiError("slow down", 429));
    const { container } = renderCard();
    expect(status(container)).toHaveTextContent(brief.error.rateLimited);
  });

  it("an error leaves an already shown brief in place", () => {
    query = { data: BRIEF, isLoading: false };
    withError(new ApiError("boom", 502));
    renderCard();
    expect(screen.getByText(BRIEF.summary!)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: brief.retry })).toBeInTheDocument();
  });
});

describe("PrBriefCard — live region (F7d)", () => {
  it("is mounted in the no-brief state and in the shown state", () => {
    query = { data: null, isLoading: false };
    const a = renderCard();
    expect(status(a.container)).not.toBeNull();
    cleanup();
    query = { data: BRIEF, isLoading: false };
    const b = renderCard();
    expect(status(b.container)).not.toBeNull();
  });

  it("is mounted while idle, empty, and its text goes generating -> error", () => {
    query = { data: null, isLoading: false };
    const { container, rerender } = renderCard();
    const region = status(container);
    expect(region.textContent).toBe("");
    // a fresh element each time: re-rendering the very same element is bailed out by React
    const el = () => (
      <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
        <PrBriefCard prId="p1" repoId="r1" prNumber={482} headSha="sha-1" hasFiles />
      </NextIntlClientProvider>
    );
    gen = { isPending: true, isError: false, error: null };
    rerender(el());
    expect(status(container)).toBe(region); // same node: the region is never remounted
    expect(region).toHaveTextContent(brief.generating);
    gen = { isPending: false, isError: true, error: new ApiError("x", 502) };
    rerender(el());
    expect(region).toHaveTextContent(brief.error.generic);
    expect(region).not.toHaveTextContent(brief.generating);
  });
});

describe("PrBriefCard — P3 verdict banner", () => {
  it("AC17: shows the verdict and score of the review it is given", () => {
    query = { data: BRIEF, isLoading: false };
    const { container } = renderCard({ latestReview: REVIEW() });
    const banner = container.querySelector("[data-brief-verdict]") as HTMLElement;
    expect(within(banner).getByText(prReview.verdict.requestChanges)).toBeInTheDocument();
    expect(within(banner).getByText("61")).toBeInTheDocument();
  });

  it("AC18: no banner without a review or when the review has no verdict", () => {
    query = { data: BRIEF, isLoading: false };
    const a = renderCard({ latestReview: null });
    expect(a.container.querySelector("[data-brief-verdict]")).toBeNull();
    cleanup();
    const b = renderCard({ latestReview: REVIEW({ verdict: null }) });
    expect(b.container.querySelector("[data-brief-verdict]")).toBeNull();
  });
});

describe("PrBriefCard — keyboard and focus (NFR9)", () => {
  it("every interactive control can take focus and none switches the outline off inline", () => {
    query = { data: BRIEF, isLoading: false };
    withErr();
    const { container } = renderCard();
    const controls = [
      ...container.querySelectorAll<HTMLElement>("a[href], button"),
    ];
    expect(controls.length).toBeGreaterThanOrEqual(4); // refresh, retry, toggle, focus links
    for (const el of controls) {
      el.focus();
      expect(el).toHaveFocus();
      expect(el.style.outline).not.toMatch(/none|0/);
    }
  });
});

function withErr() {
  gen = { isPending: false, isError: true, error: new ApiError("x", 502) };
}
