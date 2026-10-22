import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalCase, EvalSetRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { ApiError } from "@/lib/api";

// Boundary mock: the data hooks. EvalMetricCards, EvalRunHistory, ConfirmDialog and the
// case rows are the real components.
const startMutate = vi.fn();
const deleteMutate = vi.fn();
let cases: EvalCase[] = [];
let runs: EvalSetRun[] = [];
let startState: { isPending: boolean; isError: boolean; error: unknown } = {
  isPending: false,
  isError: false,
  error: null,
};
vi.mock("@/lib/hooks", () => ({
  useEvalCases: () => ({ data: cases, isLoading: false, isError: false, refetch: vi.fn() }),
  useEvalRuns: () => ({ data: runs }),
  useStartEvalRun: () => ({ mutate: startMutate, ...startState }),
  useDeleteEvalCase: () => ({ mutate: deleteMutate, isPending: false }),
  useEvalRun: () => ({ data: undefined, isError: false }),
}));

import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

const mkCase = (id: string, over: Partial<EvalCase> = {}): EvalCase => ({
  id,
  owner_kind: "agent",
  owner_id: "ag1",
  name: `case-${id}`,
  input_diff: "",
  input_files: [],
  input_meta: { pr_number: 1, title: "t", body: null },
  expected_output: { type: "must_find", items: [] },
  source_finding_id: null,
  decision_changed: false,
  last_status: "never_run",
  notes: null,
  ...over,
});

const mkRun = (id: string, over: Partial<EvalSetRun> = {}): EvalSetRun => ({
  id,
  agent_id: "ag1",
  agent_version: 1,
  model: "m",
  strategy: "auto",
  status: "done",
  started_at: "2026-10-01T00:00:00Z",
  finished_at: "2026-10-01T00:01:00Z",
  cases_total: 2,
  cases_passed: 1,
  cases_errored: 0,
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 1,
  cost_usd: 0.01,
  duration_ms: 1000,
  ...over,
});

beforeEach(() => {
  cases = [mkCase("c1"), mkCase("c2")];
  runs = [];
  startState = { isPending: false, isError: false, error: null };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const tree = () => (
  <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages }}>
    <EvalsTab agent={AGENT} />
  </NextIntlClientProvider>
);
const renderTab = () => render(tree());
const runAll = () => screen.getByRole("button", { name: evalMessages.evalsTab.runAll });
const card = (key: string) => document.querySelector(`[data-eval-metric="${key}"]`) as HTMLElement;

describe("EvalsTab cases", () => {
  it("renders one row per case with type, status text and the decision-changed badge", () => {
    cases = [
      mkCase("c1", { last_status: "pass" }),
      mkCase("c2", { last_status: "error", decision_changed: true, expected_output: { type: "must_not_flag", items: [] } }),
    ];
    renderTab();
    const rows = document.querySelectorAll("[data-eval-case-row]");
    expect(rows).toHaveLength(2);
    const r1 = within(rows[0] as HTMLElement);
    expect(r1.getByText("case-c1")).toBeInTheDocument();
    expect(r1.getByText(evalMessages.evalsTab.type.must_find)).toBeInTheDocument();
    expect(r1.getByText(evalMessages.evalsTab.status.pass)).toBeInTheDocument();
    expect(r1.queryByText(evalMessages.evalsTab.decisionChanged)).not.toBeInTheDocument();
    const r2 = within(rows[1] as HTMLElement);
    expect(r2.getByText(evalMessages.evalsTab.status.error)).toBeInTheDocument();
    expect(r2.getByText(evalMessages.evalsTab.type.must_not_flag)).toBeInTheDocument();
    expect(r2.getByText(evalMessages.evalsTab.decisionChanged)).toBeInTheDocument();
  });

  it("shows 'passed / total passing' from the cases' last status", () => {
    cases = [mkCase("c1", { last_status: "pass" }), mkCase("c2", { last_status: "fail" })];
    renderTab();
    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
  });

  it("confirm dialog names the case, and only the confirm button deletes it", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete case case-c2" }));
    expect(screen.getByText('Delete eval case "case-c2"?')).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: evalMessages.evalsTab.deleteConfirm }));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0]![0]).toBe("c2");
  });

  it("cancelling the confirm dialog deletes nothing", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete case case-c1" }));
    fireEvent.click(screen.getByRole("button", { name: commonMessages.actions.cancel }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete eval case "case-c1"?')).not.toBeInTheDocument();
  });

  it("renders a <script> case name as inert text with the full name as title", () => {
    const evil = "<script>alert(1)</script>";
    cases = [mkCase("x", { name: evil })];
    const { container } = renderTab();
    const el = screen.getByText(evil);
    expect(el).toHaveAttribute("title", evil);
    expect(container.querySelector("script")).toBeNull();
  });

  it("empty state points to 'Turn into eval case' and Run all is disabled with 0 cases", () => {
    cases = [];
    renderTab();
    expect(screen.getByText(evalMessages.evalsTab.emptyCasesHint)).toBeInTheDocument();
    expect(runAll()).toBeDisabled();
    fireEvent.click(runAll());
    expect(startMutate).not.toHaveBeenCalled();
  });
});

describe("EvalsTab run all", () => {
  it("starts a run when enabled", () => {
    renderTab();
    expect(runAll()).toBeEnabled();
    fireEvent.click(runAll());
    expect(startMutate).toHaveBeenCalledTimes(1);
  });

  it("is disabled and aria-busy while running; a polled 'done' shows the final status without a reload", () => {
    runs = [mkRun("r2", { status: "running", recall: null, precision: null, citation_accuracy: null })];
    const { rerender } = renderTab();
    expect(runAll()).toBeDisabled();
    expect(runAll()).toHaveAttribute("aria-busy", "true");
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveTextContent(evalMessages.evalsTab.runningState);

    // the poll returns the finished run
    runs = [mkRun("r2", { status: "done" })];
    rerender(tree());
    expect(runAll()).toBeEnabled();
    expect(runAll()).toHaveAttribute("aria-busy", "false");
    expect(live).toHaveTextContent("Run finished: done");
    expect(live).not.toHaveTextContent(evalMessages.evalsTab.runningState);
  });

  it("a partial run reports 'n of m cases errored' in the live region", () => {
    runs = [mkRun("r1", { status: "partial", cases_total: 5, cases_errored: 2 })];
    renderTab();
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveTextContent("2 of 5 cases errored");
    expect(live).toHaveTextContent("Run finished: partial");
  });

  it("a clean done run shows no errored text", () => {
    runs = [mkRun("r1", { status: "done", cases_errored: 0 })];
    renderTab();
    expect(screen.queryByText(/cases errored/)).not.toBeInTheDocument();
  });

  it("provider_not_configured shows the message and a link to Settings -> API Keys", () => {
    startState = { isPending: false, isError: true, error: new ApiError("x", 422, "provider_not_configured") };
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent(evalMessages.evalsTab.errors.provider_not_configured);
    expect(screen.getByRole("link", { name: evalMessages.evalsTab.settingsLink })).toHaveAttribute(
      "href",
      "/settings/api-keys",
    );
  });

  it("a 429 shows the rate-limit text and no settings link", () => {
    startState = { isPending: false, isError: true, error: new ApiError("slow", 429) };
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent(evalMessages.evalsTab.errors.rate_limited);
    expect(screen.queryByRole("link", { name: evalMessages.evalsTab.settingsLink })).not.toBeInTheDocument();
  });

  it("an unknown error falls back to the generic text", () => {
    startState = { isPending: false, isError: true, error: new Error("boom") };
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent(evalMessages.evalsTab.errors.generic);
  });
});

describe("EvalsTab metric cards", () => {
  it("shows four cards with signed deltas against the previous finished run and an em dash for null", () => {
    runs = [
      mkRun("r2", { recall: 0.8, precision: null, citation_accuracy: 0.5, cases_passed: 3, cases_total: 4 }),
      mkRun("r-failed", { status: "failed", recall: null, precision: null, citation_accuracy: null }),
      mkRun("r1", { recall: 0.5, precision: 0.5, citation_accuracy: 0.9, cases_passed: 1, cases_total: 4 }),
    ];
    renderTab();
    expect(document.querySelectorAll("[data-eval-metric]")).toHaveLength(4);
    // recall 80% vs 50% -> +30 pt (the failed run between them is skipped)
    expect(within(card("recall")).getByText("80%")).toBeInTheDocument();
    expect(within(card("recall")).getByText("+30 pt")).toBeInTheDocument();
    // precision null -> value and delta are em dashes
    expect(within(card("precision")).getAllByText("—")).toHaveLength(2);
    // citation 50% vs 90% -> -40 pt with a real minus sign
    expect(within(card("citation")).getByText("−40 pt")).toBeInTheDocument();
    // passed card reads "n / m"
    expect(within(card("passed")).getByText("3 / 4")).toBeInTheDocument();
  });

  it("the first run has no delta: every card shows the no-earlier-run note", () => {
    runs = [mkRun("r1")];
    renderTab();
    expect(screen.getAllByText(evalMessages.evalsTab.noDelta)).toHaveLength(4);
  });

  it("with no runs the cards show dashes and the no-delta note", () => {
    renderTab();
    expect(within(card("recall")).getByText("—")).toBeInTheDocument();
    expect(screen.getAllByText(evalMessages.evalsTab.noDelta)).toHaveLength(4);
  });
});
