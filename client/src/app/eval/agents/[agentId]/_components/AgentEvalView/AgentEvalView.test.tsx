import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentDashboard, EvalMetricPoint, EvalSetRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";

// Boundary mocks: app chrome, route params and the data hooks. Cards, trend, run table, Compare are real.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ agentId: "a1" }) }));

interface DashQuery {
  data: EvalAgentDashboard | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}
interface StartMutation {
  mutate: () => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}
let query: DashQuery;
let start: StartMutation;
const refetch = vi.fn();
const mutate = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useAgentEvalDashboard: () => query,
  useStartEvalRun: () => start,
  useEvalRun: () => ({ data: undefined, isError: false }),
}));

import { AgentEvalView } from "./AgentEvalView";

const mkRun = (id: string, over: Partial<EvalSetRun> = {}): EvalSetRun => ({
  id,
  agent_id: "a1",
  agent_version: 1,
  model: "m/x",
  strategy: "auto",
  status: "done",
  started_at: "2026-10-01T10:00:00Z",
  finished_at: "2026-10-01T10:01:00Z",
  cases_total: 4,
  cases_passed: 2,
  cases_errored: 0,
  recall: 0.5,
  precision: 0.6,
  citation_accuracy: 1,
  cost_usd: 0.01,
  duration_ms: 1,
  ...over,
});

const point = (id: string, over: Partial<EvalMetricPoint> = {}): EvalMetricPoint => ({
  run_id: id,
  finished_at: "2026-10-01T10:01:00Z",
  recall: 0.5,
  precision: 0.6,
  citation_accuracy: 1,
  ...over,
});

const OLD = mkRun("old", { agent_version: 1, started_at: "2026-10-01T10:00:00Z", recall: 0.5, precision: 0.6, citation_accuracy: 1 });
const NEW = mkRun("new", { agent_version: 2, started_at: "2026-10-02T10:00:00Z", recall: 0.8, precision: 0.5, citation_accuracy: 1 });

const mkDash = (over: Partial<EvalAgentDashboard> = {}): EvalAgentDashboard => ({
  agent_id: "a1",
  name: "Security Reviewer",
  model: "m/x",
  cases_total: 4,
  latest: NEW,
  previous: OLD,
  trend: [point("old", { finished_at: "2026-10-01T10:01:00Z" }), point("new", { finished_at: "2026-10-02T10:01:00Z", recall: 0.8 })],
  runs: [NEW, OLD],
  ...over,
});

const ready = (data: EvalAgentDashboard) => {
  query = { data, isPending: false, isError: false, error: null, refetch };
};
const idleStart = (over: Partial<StartMutation> = {}) => {
  start = { mutate, isPending: false, isError: false, error: null, ...over };
};

afterEach(() => {
  cleanup();
  refetch.mockClear();
  mutate.mockClear();
});

const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <AgentEvalView />
    </NextIntlClientProvider>,
  );

const d = evalMessages.dashboard;
const when = (iso: string) => new Date(iso).toLocaleString("en");
const pickLabel = (version: number, iso: string) => `Select run v${version} from ${when(iso)}`;
const delta = (key: string) => document.querySelector(`[data-eval-delta='${key}']`) as HTMLElement;

describe("AgentEvalView header and navigation", () => {
  it("links back to /eval and titles the page with the agent name and model", () => {
    idleStart();
    ready(mkDash());
    renderView();
    expect(screen.getByRole("link", { name: d.allAgents })).toHaveAttribute("href", "/eval");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Security Reviewer");
    expect(h1).toHaveTextContent("m/x");
  });
});

describe("AgentEvalView metric cards", () => {
  it("shows recall, precision and citation cards with signed deltas against the previous run", () => {
    idleStart();
    ready(mkDash());
    renderView();
    const cards = Array.from(document.querySelectorAll("[data-eval-metric]")).map((c) => c.getAttribute("data-eval-metric"));
    expect(cards).toEqual(["recall", "precision", "citation"]);
    expect(delta("recall")).toHaveTextContent("+30 pt");
    expect(delta("precision")).toHaveTextContent("−10 pt");
    expect(delta("citation")).toHaveTextContent("±0 pt");
    expect(document.querySelector("[data-eval-metric='recall']")).toHaveTextContent("80%");
  });

  it("shows no delta, only the no-earlier-run note, when the agent has a single finished run", () => {
    idleStart();
    ready(mkDash({ previous: null, trend: [point("new")], runs: [NEW] }));
    renderView();
    for (const key of ["recall", "precision", "citation"]) {
      expect(delta(key)).toHaveTextContent(evalMessages.evalsTab.noDelta);
      expect(delta(key)).not.toHaveTextContent(/pt$/);
    }
  });

  it("shows dashes and the no-delta note when there is no finished run", () => {
    idleStart();
    ready(mkDash({ latest: null, previous: null, trend: [], runs: [mkRun("f", { status: "failed", recall: null, precision: null, citation_accuracy: null })] }));
    renderView();
    expect(document.querySelector("[data-eval-metric='recall']")).toHaveTextContent("—");
    expect(delta("recall")).toHaveTextContent(evalMessages.evalsTab.noDelta);
    expect(screen.getByText(d.noFinishedRun)).toBeInTheDocument();
  });
});

describe("AgentEvalView trend", () => {
  const trendRows = () => {
    const table = document.querySelector("[data-eval-trend-table]") as HTMLElement;
    return within(table).getAllByRole("row").slice(1);
  };

  it("has one text-alternative table row per finished run, in chronological order", () => {
    idleStart();
    ready(mkDash());
    renderView();
    const table = document.querySelector("[data-eval-trend-table]") as HTMLElement;
    expect(within(table).getByText(d.trendTableCaption)).toBeInTheDocument();
    const rows = trendRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(when("2026-10-01T10:01:00Z"));
    expect(rows[1]).toHaveTextContent(when("2026-10-02T10:01:00Z"));
    expect(rows[1]).toHaveTextContent("80%");
  });

  it("shows a dash in the table for a null metric and keeps the row", () => {
    idleStart();
    ready(mkDash({ trend: [point("old", { precision: null }), point("new")] }));
    renderView();
    const rows = trendRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["50%", "—", "100%"]);
  });

  it("lists the three legend entries", () => {
    idleStart();
    ready(mkDash());
    renderView();
    const section = document.querySelector("[data-eval-trend]") as HTMLElement;
    for (const name of ["Recall", "Precision", "Citation"]) expect(within(section).getAllByText(name).length).toBeGreaterThanOrEqual(1);
  });
});

describe("AgentEvalView run history", () => {
  const compareBtn = () => screen.getByRole("button", { name: evalMessages.compare.compareButton });

  it("keeps Compare disabled until two runs are checked, then opens the dialog", () => {
    idleStart();
    ready(mkDash());
    renderView();
    expect(compareBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: pickLabel(2, NEW.started_at) }));
    expect(compareBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: pickLabel(1, OLD.started_at) }));
    expect(compareBtn()).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(compareBtn());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("formats each run's cost with the three-way format", () => {
    idleStart();
    const runs = [
      mkRun("c1", { agent_version: 4, cost_usd: 0.0125 }),
      mkRun("c2", { agent_version: 3, cost_usd: 0.00003 }),
      mkRun("c3", { agent_version: 2, cost_usd: null }),
      mkRun("c4", { agent_version: 1, cost_usd: 0 }),
    ];
    ready(mkDash({ runs }));
    renderView();
    const cost = (id: string) => {
      const cells = within(document.querySelector(`[data-eval-run-row='${id}']`) as HTMLElement).getAllByRole("cell");
      return cells[cells.length - 1]!.textContent;
    };
    expect(cost("c1")).toBe("$0.0125");
    expect(cost("c2")).toBe("<$0.0001");
    expect(cost("c3")).toBe("—");
    expect(cost("c4")).toBe("$0.00");
  });

  it("shows Precision and Citation columns for each run", () => {
    idleStart();
    ready(mkDash());
    renderView();
    const table = within(document.querySelector("[data-eval-run-history]") as HTMLElement).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: evalMessages.compare.colPrecision })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: evalMessages.compare.colCitation })).toBeInTheDocument();
    const row = document.querySelector("[data-eval-run-row='new']") as HTMLElement;
    expect(row).toHaveTextContent("80%");
    expect(row).toHaveTextContent("50%");
    expect(row).toHaveTextContent("100%");
  });
});

describe("AgentEvalView Run eval", () => {
  it("starts a run once per click", () => {
    idleStart();
    ready(mkDash());
    renderView();
    fireEvent.click(screen.getByRole("button", { name: d.runEvalButton }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("is disabled while the newest run is running, and clicking does nothing", () => {
    idleStart();
    ready(mkDash({ runs: [mkRun("live", { status: "running", finished_at: null, recall: null }), NEW, OLD] }));
    renderView();
    const btn = screen.getByRole("button", { name: d.running });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: d.runEvalButton })).not.toBeInTheDocument();
  });

  it("is disabled while the start request is in flight", () => {
    idleStart({ isPending: true });
    ready(mkDash());
    renderView();
    const btn = screen.getByRole("button", { name: d.runEvalButton });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["409 eval_run_active", new ApiError("x", 409, "eval_run_active"), evalMessages.evalsTab.errors.eval_run_active],
    ["422 no_eval_cases", new ApiError("x", 422, "no_eval_cases"), evalMessages.evalsTab.errors.no_eval_cases],
    ["422 provider_not_configured", new ApiError("x", 422, "provider_not_configured"), evalMessages.evalsTab.errors.provider_not_configured],
    ["429", new ApiError("x", 429, "too_many"), evalMessages.evalsTab.errors.rate_limited],
    ["500", new ApiError("x", 500, "boom"), evalMessages.evalsTab.errors.generic],
  ])("explains a failed start: %s", (_label, error, text) => {
    idleStart({ isError: true, error });
    ready(mkDash());
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });

  it("offers the API keys settings link only for provider_not_configured", () => {
    idleStart({ isError: true, error: new ApiError("x", 422, "provider_not_configured") });
    ready(mkDash());
    renderView();
    expect(screen.getByRole("link", { name: evalMessages.evalsTab.settingsLink })).toHaveAttribute("href", "/settings/api-keys");
    cleanup();
    idleStart({ isError: true, error: new ApiError("x", 409, "eval_run_active") });
    renderView();
    expect(screen.queryByRole("link", { name: evalMessages.evalsTab.settingsLink })).not.toBeInTheDocument();
  });

  it("shows no error alert when the start has not failed", () => {
    idleStart();
    ready(mkDash());
    renderView();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AgentEvalView states", () => {
  it("shows busy skeletons on the first load and no Run eval button", () => {
    idleStart();
    query = { data: undefined, isPending: true, isError: false, error: null, refetch };
    const { container } = renderView();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: d.runEvalButton })).not.toBeInTheDocument();
  });

  it("shows the not-found state with a way back to /eval on a 404", () => {
    idleStart();
    query = { data: undefined, isPending: false, isError: true, error: new ApiError("nf", 404, "not_found"), refetch };
    renderView();
    expect(screen.getByText(d.notFoundTitle)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: d.allAgents }).every((l) => l.getAttribute("href") === "/eval")).toBe(true);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows an error with Retry for a non-404 failure and Retry refetches", () => {
    idleStart();
    query = { data: undefined, isPending: false, isError: true, error: new ApiError("down", 500, "server_error"), refetch };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent(d.errorTitle);
    expect(screen.queryByText(d.notFoundTitle)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
