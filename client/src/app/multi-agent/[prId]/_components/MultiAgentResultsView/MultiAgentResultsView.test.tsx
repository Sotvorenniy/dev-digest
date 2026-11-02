import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { AgentColumn, Conflict, MultiAgentRun } from "@/lib/types";
import runs from "../../../../../../messages/en/runs.json";
import prReview from "../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../messages/en/eval.json";

// ---- boundary mocks (repo overrides): hooks, navigation, AppShell ----
const h = vi.hoisted(() => ({
  query: { data: undefined, isError: false, refetch: vi.fn() } as {
    data: unknown;
    isError: boolean;
    refetch: ReturnType<typeof vi.fn>;
  },
  agentsParam: "a1,a2,a3,a4",
  findingMutate: vi.fn(),
  hookArgs: [] as unknown[],
  live: false,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ prId: "p1" }),
  useSearchParams: () => new URLSearchParams(`agents=${h.agentsParam}`),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentRun: (prId: string, ids: string[]) => {
    h.hookArgs.push([prId, ids]);
    return h.query;
  },
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: h.findingMutate, isPending: false }),
  useRunEvents: () => ({ events: [], running: h.live }),
}));
vi.mock("@/lib/hooks/trace", () => ({ useRunTrace: () => ({ data: undefined, isLoading: true }) }));
vi.mock("@/lib/hooks", () => ({
  useAgents: () => ({ data: [] }),
  useCreateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEvalCaseDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { MultiAgentResultsView } from "./MultiAgentResultsView";

const finding = (id: string, title: string, over: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity: "WARNING",
  category: "bug",
  title,
  file: "src/a.ts",
  start_line: 1,
  end_line: 2,
  rationale: "why",
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r",
  accepted_at: null,
  dismissed_at: null,
  agent_id: null,
  agent_name: null,
  group_key: null,
  agreed_by: [],
  ...over,
});

const column = (over: Partial<AgentColumn>): AgentColumn => ({
  run_id: "run-x",
  agent_id: "a?",
  agent_name: "Agent",
  provider: "openai",
  model: "gpt",
  status: "done",
  error: null,
  verdict: "comment",
  score: 80,
  summary: "A summary",
  duration_ms: 1000,
  cost_usd: 0.01,
  findings: [],
  ...over,
});

function fixture(over: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: null,
    pr_id: "p1",
    pr_number: 7,
    ran_at: null,
    agent_count: 4,
    total_duration_ms: 0,
    total_cost_usd: null,
    columns: [
      column({
        agent_id: "a1",
        agent_name: "Security",
        run_id: "run-1",
        score: 72,
        duration_ms: 1500,
        cost_usd: 0.02,
        findings: [finding("f1", "Leaked key", { severity: "CRITICAL" }), finding("f2", "Slow loop")],
      }),
      column({ agent_id: "a2", agent_name: "Perf", run_id: "run-2", score: null, duration_ms: 500, cost_usd: null }),
      column({ agent_id: "a3", agent_name: "Style", run_id: "run-3", status: "failed", error: "provider exploded", score: null, duration_ms: null, cost_usd: null }),
      column({ agent_id: "a4", agent_name: "Tests", run_id: null, status: "none", score: null, duration_ms: null, cost_usd: null }),
    ],
    conflicts: [],
    ...over,
  };
}

const conflict = (key: string, isConflict: boolean, takes: Conflict["takes"]): Conflict => ({
  file: "src/a.ts",
  line: 1,
  end_line: 2,
  group_key: key,
  is_conflict: isConflict,
  title: `Title ${key}`,
  takes,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs, prReview, eval: evalMessages }}>
      <MultiAgentResultsView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  h.query = { data: fixture(), isError: false, refetch: vi.fn() };
  h.agentsParam = "a1,a2,a3,a4";
  h.findingMutate.mockReset();
  h.hookArgs = [];
  h.live = false;
});
afterEach(cleanup);

const columnOf = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-agent-column="${id}"]`);
  if (!el) throw new Error(`no column rendered for agent ${id}`);
  return el;
};

describe("MultiAgentResultsView columns", () => {
  it("AC9: one column per agent in URL order with name, duration, cost, score and findings count; null score is a dash", () => {
    renderView();
    const cols = Array.from(document.querySelectorAll("[data-agent-column]")).map((c) => c.getAttribute("data-agent-column"));
    expect(cols).toEqual(["a1", "a2", "a3", "a4"]); // fails if columns are reordered
    expect(h.hookArgs[0]).toEqual(["p1", ["a1", "a2", "a3", "a4"]]);
    const a1 = within(columnOf("a1"));
    expect(a1.getByText("Security")).toBeInTheDocument();
    expect(a1.getByRole("img", { name: "Score 72 of 100" })).toBeInTheDocument();
    expect(a1.getByText("1.5 s")).toBeInTheDocument();
    expect(a1.getByText("$0.02")).toBeInTheDocument();
    expect(a1.getByText("2 findings")).toBeInTheDocument();
    expect(a1.getByText("Leaked key")).toBeInTheDocument();
    expect(within(columnOf("a2")).getByRole("img", { name: runs.column.noScore })).toBeInTheDocument();
    expect(within(columnOf("a2")).getByText(runs.column.noFindings)).toBeInTheDocument();
  });

  it("AC10/EC16: header sums durations and known costs", () => {
    renderView();
    // 1500+500 ms = 2.0 s; only a1's cost is known
    expect(screen.getByText("4 agents · sequential · 2.0 s total · $0.02")).toBeInTheDocument();
    expect(screen.queryByText(/parallel|worktree/i)).not.toBeInTheDocument();
  });

  it("AC12: failed shows its status and stored error, none shows 'not run', neighbours render normally", () => {
    renderView();
    const a3 = within(columnOf("a3"));
    expect(a3.getByText(runs.column.status.failed)).toBeInTheDocument();
    expect(a3.getByText("provider exploded")).toBeInTheDocument();
    expect(within(columnOf("a4")).getByText(runs.column.status.none)).toBeInTheDocument();
    expect(within(columnOf("a4")).getByRole("button", { name: runs.viewTrace })).toBeDisabled(); // no run to trace
    expect(within(columnOf("a1")).getByText(runs.column.status.done)).toBeInTheDocument();
    expect(screen.queryByText("provider exploded", { selector: "[data-agent-column=a1] *" })).not.toBeInTheDocument();
  });

  it("AC11: a running column shows the in-progress state and, once the data flips to done, the findings — no navigation", () => {
    const running = fixture();
    running.columns[0] = column({ agent_id: "a1", agent_name: "Security", run_id: "run-1", status: "running", score: null, findings: [] });
    h.query = { data: running, isError: false, refetch: vi.fn() };
    const { rerender } = renderView();
    const status = within(columnOf("a1")).getByText(runs.column.status.running);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText("Leaked key")).not.toBeInTheDocument();

    h.query = { data: fixture(), isError: false, refetch: vi.fn() };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ runs, prReview, eval: evalMessages }}>
        <MultiAgentResultsView />
      </NextIntlClientProvider>,
    );
    expect(within(columnOf("a1")).getByText(runs.column.status.done)).toBeInTheDocument();
    expect(screen.getByText("Leaked key")).toBeInTheDocument();
  });

  it("shows a skeleton while loading and a retry on error", () => {
    h.query = { data: undefined, isError: false, refetch: vi.fn() };
    const { unmount } = renderView();
    expect(document.querySelector("[data-agent-column]")).toBeNull();
    unmount();
    h.query = { data: undefined, isError: true, refetch: vi.fn() };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(h.query.refetch).toHaveBeenCalledTimes(1);
  });
});

describe("MultiAgentResultsView trace drawer (AC13)", () => {
  it("View trace opens the drawer titled with that agent's name", () => {
    renderView();
    fireEvent.click(within(columnOf("a1")).getByRole("button", { name: runs.viewTrace }));
    expect(screen.getByText("Agent run · Security")).toBeInTheDocument();
    expect(screen.getByText("PR #7 · completed")).toBeInTheDocument();
  });

  it("a running column opens the drawer in the running state", () => {
    const running = fixture();
    running.columns[0] = column({ agent_id: "a1", agent_name: "Security", run_id: "run-1", status: "running" });
    h.query = { data: running, isError: false, refetch: vi.fn() };
    h.live = true;
    renderView();
    fireEvent.click(within(columnOf("a1")).getByRole("button", { name: runs.viewTrace }));
    expect(screen.getByText("PR #7 · running")).toBeInTheDocument();
  });
});

describe("MultiAgentResultsView tabs (AC14)", () => {
  const toTabs = () => fireEvent.click(screen.getByRole("radio", { name: runs.page.view.tabs }));

  it("toggle switches view; one tab per column with name and score; first tab selected", () => {
    renderView();
    expect(screen.getByRole("radio", { name: runs.page.view.columns })).toHaveAttribute("aria-checked", "true");
    toTabs();
    expect(screen.getByRole("radio", { name: runs.page.view.tabs })).toHaveAttribute("aria-checked", "true");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Security · 72", "Perf · —", "Style · —", "Tests · —"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector("[data-columns-view]")).toBeNull();
  });

  it("selected tab shows summary card and FindingCards with Accept/Dismiss but no Learn/Reply", () => {
    renderView();
    toTabs();
    const panel = within(screen.getByRole("tabpanel"));
    expect(panel.getByText("A summary")).toBeInTheDocument();
    expect(panel.getByText("Leaked key")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: runs.viewTrace })).toBeEnabled();
    fireEvent.click(panel.getByText("Leaked key")); // cards start collapsed
    expect(panel.getByRole("button", { name: prReview.finding.accept })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: prReview.finding.dismiss })).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /learn|reply/i })).not.toBeInTheDocument();
  });

  it("accepting a finding sends the action for that finding id", () => {
    renderView();
    toTabs();
    const panel = within(screen.getByRole("tabpanel"));
    fireEvent.click(panel.getByText("Leaked key"));
    fireEvent.click(panel.getByRole("button", { name: prReview.finding.accept }));
    expect(h.findingMutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "p1" });
  });

  it("selecting another tab shows that agent's panel and the no-summary fallback", () => {
    const d = fixture();
    d.columns[1] = column({ agent_id: "a2", agent_name: "Perf", summary: null });
    h.query = { data: d, isError: false, refetch: vi.fn() };
    renderView();
    toTabs();
    fireEvent.click(screen.getByRole("tab", { name: /Perf/ }));
    expect(screen.getByRole("tab", { name: /Perf/ })).toHaveAttribute("aria-selected", "true");
    const panel = within(screen.getByRole("tabpanel"));
    expect(panel.getByText(runs.tabs.noSummary)).toBeInTheDocument();
    expect(panel.getByText(runs.column.noFindings)).toBeInTheDocument();
  });
});

describe("MultiAgentResultsView conflicts (AC15, EC13)", () => {
  const withConflicts = () => {
    const d = fixture({
      conflicts: [
        conflict("k1", true, [
          { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "Leaked key" },
          { agent_id: "a2", persona: "Perf", verdict: "ignored", note: "" },
        ]),
        conflict("k2", false, [
          { agent_id: "a1", persona: "Security", verdict: "WARNING", note: "Same" },
          { agent_id: "a2", persona: "Perf", verdict: "WARNING", note: "Same" },
        ]),
      ],
    });
    h.query = { data: d, isError: false, refetch: vi.fn() };
  };
  const rows = () => Array.from(document.querySelectorAll("[data-conflict-row]"));

  it("lists one row per group with a cell per column; 'did not flag' for ignored takes", () => {
    withConflicts();
    renderView();
    expect(rows()).toHaveLength(2);
    const k1 = document.querySelector('[data-conflict-row="k1"]') as HTMLElement;
    expect(k1.querySelectorAll("[data-conflict-cell]")).toHaveLength(4);
    expect(within(k1).getByText(runs.conflicts.didNotFlag)).toBeInTheDocument();
    expect(within(k1).getByText("Leaked key")).toBeInTheDocument();
    expect(within(k1).getByText("src/a.ts:1")).toBeInTheDocument();
  });

  it("renders a human severity label for a take", () => {
    withConflicts();
    renderView();
    const k1 = document.querySelector('[data-conflict-row="k1"]') as HTMLElement;
    expect(within(k1).getByText(runs.severity.critical)).toBeInTheDocument();
  });

  it("'Show only conflicts' hides rows with is_conflict false", () => {
    withConflicts();
    renderView();
    fireEvent.click(screen.getByRole("checkbox", { name: runs.conflicts.onlyConflicts }));
    expect(rows().map((r) => r.getAttribute("data-conflict-row"))).toEqual(["k1"]);
  });

  it("shows the empty text when no conflict row remains", () => {
    renderView();
    expect(screen.getByText(runs.conflicts.empty)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });
});
