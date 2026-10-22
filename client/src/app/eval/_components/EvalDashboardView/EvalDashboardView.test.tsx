import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentSummary, EvalRecentRun, EvalSetRun, EvalWorkspaceDashboard } from "@devdigest/shared";
import evalMessages from "../../../../../messages/en/eval.json";

// Boundary mocks: the app chrome and the data hook. Rows, table, empty/error states are real.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

interface QueryResult {
  data: EvalWorkspaceDashboard | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}
let query: QueryResult;
const refetch = vi.fn();
vi.mock("@/lib/hooks", () => ({ useEvalDashboard: () => query }));

import { EvalDashboardView } from "./EvalDashboardView";

const mkRun = (id: string, over: Partial<EvalSetRun> = {}): EvalSetRun => ({
  id,
  agent_id: "a1",
  agent_version: 3,
  model: "m/x",
  strategy: "auto",
  status: "done",
  started_at: "2026-10-01T10:00:00Z",
  finished_at: "2026-10-01T10:01:00Z",
  cases_total: 4,
  cases_passed: 3,
  cases_errored: 0,
  recall: 0.75,
  precision: 0.5,
  citation_accuracy: 1,
  cost_usd: 0.01,
  duration_ms: 1,
  ...over,
});

const mkAgent = (id: string, name: string, over: Partial<EvalAgentSummary> = {}): EvalAgentSummary => ({
  agent_id: id,
  name,
  model: "m/x",
  cases_total: 4,
  latest: mkRun(`run-${id}`, { agent_id: id }),
  recall_series: [0.1, 0.5, 0.9],
  ...over,
});

const mkRecent = (id: string, agentName: string, over: Partial<EvalSetRun> = {}): EvalRecentRun => ({
  ...mkRun(id, over),
  agent_name: agentName,
});

const ready = (data: EvalWorkspaceDashboard) => {
  query = { data, isPending: false, isError: false, refetch };
};

afterEach(() => {
  cleanup();
  refetch.mockClear();
});

const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
const d = evalMessages.dashboard;
const rowLabel = (name: string) => d.agentRowLabel.replace("{name}", name);

describe("EvalDashboardView agents", () => {
  it("renders one link per agent, named after the agent, pointing at its eval page", () => {
    ready({ agents: [mkAgent("a1", "Security Reviewer"), mkAgent("a2", "Style Reviewer")], recent_runs: [] });
    renderView();
    const first = screen.getByRole("link", { name: rowLabel("Security Reviewer") });
    expect(first).toHaveAttribute("href", "/eval/agents/a1");
    expect(screen.getByRole("link", { name: rowLabel("Style Reviewer") })).toHaveAttribute("href", "/eval/agents/a2");
    expect(screen.getAllByRole("link", { name: /eval results$/ })).toHaveLength(2);
  });

  it("shows the latest run's version, pass count and recall / precision / citation", () => {
    ready({ agents: [mkAgent("a1", "Security Reviewer")], recent_runs: [] });
    renderView();
    const row = document.querySelector("[data-eval-agent-row='a1']") as HTMLElement;
    expect(within(row).getByText(/Last run v3 · .* · 3\/4 pass/)).toBeInTheDocument();
    expect(within(row).getByText("Recall 75%")).toBeInTheDocument();
    expect(within(row).getByText("Precision 50%")).toBeInTheDocument();
    expect(within(row).getByText("Citation 100%")).toBeInTheDocument();
    expect(within(row).getByText("m/x")).toBeInTheDocument();
  });

  it("shows 'never run' for an agent whose latest is null, and no metrics", () => {
    ready({ agents: [mkAgent("a1", "Fresh Agent", { latest: null, recall_series: [] })], recent_runs: [] });
    renderView();
    const row = screen.getByRole("link", { name: rowLabel("Fresh Agent") });
    expect(within(row).getByText(d.neverRun)).toBeInTheDocument();
    expect(within(row).queryByText(/^Recall/)).not.toBeInTheDocument();
    expect(within(row).queryByRole("img")).not.toBeInTheDocument();
  });

  it("names the sparkline with the series length and its first and last value", () => {
    ready({ agents: [mkAgent("a1", "Security Reviewer", { recall_series: [0.1, 0.5, 0.9] })], recent_runs: [] });
    renderView();
    expect(
      screen.getByRole("img", { name: d.sparklineAlt.replace("{count}", "3").replace("{first}", "10%").replace("{last}", "90%") }),
    ).toBeInTheDocument();
  });

  it("a single-point series is still named, as text rather than a line", () => {
    ready({ agents: [mkAgent("a1", "One Point", { recall_series: [0.4] })], recent_runs: [] });
    renderView();
    const img = screen.getByRole("img", {
      name: d.sparklineAlt.replace("{count}", "1").replace("{first}", "40%").replace("{last}", "40%"),
    });
    expect(img).toHaveTextContent("40%");
  });

  it("gives a long agent name a title with the full text (NFR3)", () => {
    const long = "An extremely long agent name that the row has to truncate to stay on one line";
    ready({ agents: [mkAgent("a1", long)], recent_runs: [] });
    renderView();
    expect(screen.getByText(long)).toHaveAttribute("title", long);
  });
});

describe("EvalDashboardView recent runs", () => {
  it("lists the runs in server order with the agent name, and a running run shows the running state instead of metrics", () => {
    ready({
      agents: [mkAgent("a1", "Security Reviewer")],
      recent_runs: [
        mkRecent("r-new", "Style Reviewer", { status: "running", finished_at: null, recall: null, precision: null, citation_accuracy: null }),
        mkRecent("r-mid", "Security Reviewer", { recall: 0.8 }),
        mkRecent("r-old", "Security Reviewer", { recall: 0.2, agent_version: 1 }),
      ],
    });
    renderView();
    const table = screen.getByRole("table", { name: d.recentRunsAll });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Style Reviewer");
    expect(rows[0]).toHaveTextContent(d.runningState);
    expect(rows[0]).not.toHaveTextContent("%");
    expect(rows[1]).toHaveTextContent("Security Reviewer");
    expect(rows[1]).toHaveTextContent("80%");
    expect(rows[2]).toHaveTextContent("v1");
    expect(rows[2]).toHaveTextContent("20%");
  });

  it("shows the no-runs text when agents exist but no run does", () => {
    ready({ agents: [mkAgent("a1", "Security Reviewer", { latest: null, recall_series: [] })], recent_runs: [] });
    renderView();
    expect(screen.getByText(d.noRuns)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: d.recentRunsAll })).not.toBeInTheDocument();
  });
});

describe("EvalDashboardView states", () => {
  it("shows the empty state with a link to /agents when no agent has cases", () => {
    ready({ agents: [], recent_runs: [] });
    renderView();
    expect(screen.getByText(d.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: d.emptyLink })).toHaveAttribute("href", "/agents");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows busy skeletons and no agent rows on the first load", () => {
    query = { data: undefined, isPending: true, isError: false, refetch };
    const { container } = renderView();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(container.querySelector("[data-eval-dashboard]")).toHaveAttribute("data-state", "loading");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows an error with a Retry that refetches", () => {
    query = { data: undefined, isPending: false, isError: true, refetch };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent(d.errorTitle);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("titles the page with the Eval Dashboard heading", () => {
    ready({ agents: [mkAgent("a1", "Security Reviewer")], recent_runs: [] });
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: d.defaultTitle })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: d.agentsHeading })).toBeInTheDocument();
  });
});
