import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentPerf, AgentPerfRow } from "@/lib/types";
import messages from "../../../../../messages/en/agentPerformance.json";

// ---- navigation: a tiny URL store so router.replace() really changes useSearchParams() ----
let search = "";
const listeners = new Set<() => void>();
const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (url: string) => {
      replaceSpy(url);
      search = url.split("?")[1] ?? "";
      listeners.forEach((l) => l());
    },
    push: vi.fn(),
  }),
  useSearchParams: () => {
    React.useSyncExternalStore(
      (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => search,
      () => search,
    );
    return new URLSearchParams(search);
  },
}));

// AppShell pulls in the whole app chrome; stub it to a passthrough (repo override).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

// ---- fetch stub: records every call, answers from `respond` ----
type Responder = (url: string) => Promise<unknown> | unknown;
let respond: Responder;
const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: status === 200 ? "OK" : "Error", json: async () => body };
}

beforeEach(() => {
  search = "";
  listeners.clear();
  replaceSpy.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => respond(url));
  vi.stubGlobal("fetch", fetchMock);
  respond = () => jsonResponse(perf());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---- fixtures ----
const DAY = 24 * 3600 * 1000;

function row(over: Partial<AgentPerfRow> & { agent_id: string | null; agent_name: string | null }): AgentPerfRow {
  return {
    provider: "openai",
    model: "gpt-x",
    runs: 7,
    findings_total: 9,
    accepted: 4,
    dismissed: 1,
    pending: 4,
    decided: 20,
    unpriced_runs: 0,
    previous_decided: 20,
    previous_accept_rate: 0.5,
    accept_rate: 0.5,
    dismiss_rate: 0.5,
    avg_findings_per_run: 1,
    total_cost_usd: 0.35,
    avg_cost_usd: 0.05,
    avg_latency_ms: 1200,
    last_run_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    findings_by_severity: { CRITICAL: 1, WARNING: 2, SUGGESTION: 3 },
    trend: [1, 2],
    cost_by_model: [{ label: "gpt-x", value: 0.35, kind: "model" }],
    ...over,
  };
}

function perf(over: Partial<AgentPerf> = {}, summary: Partial<AgentPerf["summary"]> = {}): AgentPerf {
  const agents = over.agents ?? [row({ agent_id: "a1", agent_name: "Alpha" })];
  return {
    period: {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
      previous_from: "2026-08-01T00:00:00.000Z",
      previous_to: "2026-09-01T00:00:00.000Z",
    },
    cost_basis: "estimate",
    summary: {
      has_any_runs: true,
      runs: 7,
      total_cost_usd: 0.5,
      previous_total_cost_usd: 0.2,
      unpriced_runs: 0,
      avg_accept_rate: 0.5,
      accepted: 10,
      decided: 21,
      most_active_agent: "Alpha",
      most_active: { agent_id: "a1", agent_name: "Alpha", runs: 7, accept_rate: 0.5, decided: 20 },
      runs_series: [
        { label: "2026-09-01T00:00:00.000Z", value: 3 },
        { label: "2026-09-02T00:00:00.000Z", value: 4 },
      ],
      ...summary,
    },
    agents,
    cost_by_agent: [{ label: "Alpha", value: 0.5, kind: "agent", agent_id: "a1" }],
    cost_by_model: [{ label: "gpt-x", value: 0.5, kind: "model" }],
    ...over,
  };
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <AgentPerformanceView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const methods = () => fetchMock.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.method ?? "GET");
const rowEl = (c: HTMLElement, id: string) => c.querySelector(`[data-agent-id="${id}"]`) as HTMLElement;
const rowOrder = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("[data-agent-id]")).map((e) => e.getAttribute("data-agent-id"));

async function ready(c: HTMLElement) {
  await waitFor(() => expect(c.querySelector("[data-agent-performance]")?.getAttribute("data-state")).toBe("ready"));
}

describe("AgentPerformanceView period (NFR2, AC2, AC3, AC4)", () => {
  it("NFR2/AC3: opens with one GET for a 30-day window and writes nothing to the URL", async () => {
    const { container } = renderView();
    await ready(container);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const u = new URL(urls()[0]!);
    expect(u.pathname).toBe("/agents/performance");
    expect(methods()).toEqual(["GET"]);
    expect(Date.parse(u.searchParams.get("to")!) - Date.parse(u.searchParams.get("from")!)).toBe(30 * DAY);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: messages.period.thirtyDays })).toHaveAttribute("aria-pressed", "true");
  });

  it("AC3: a valid URL period is used as is and the picker shows it", async () => {
    const from = new Date(2026, 9, 1).toISOString();
    const to = new Date(2026, 9, 4).toISOString();
    search = new URLSearchParams({ from, to, range: "custom" }).toString();
    const { container } = renderView();
    await ready(container);
    const u = new URL(urls()[0]!);
    expect(u.searchParams.get("from")).toBe(from);
    expect(u.searchParams.get("to")).toBe(to);
    expect(screen.getByLabelText(messages.period.start)).toHaveValue("2026-10-01");
    expect(screen.getByLabelText(messages.period.end)).toHaveValue("2026-10-03");
  });

  it("AC3/EC12: a crafted URL falls back to 30 days instead of calling the API with it", async () => {
    search = "from=yesterday&to=%3Cscript%3E&range=custom";
    const { container } = renderView();
    await ready(container);
    const u = new URL(urls()[0]!);
    expect(Date.parse(u.searchParams.get("to")!) - Date.parse(u.searchParams.get("from")!)).toBe(30 * DAY);
  });

  it("AC2: picking '1 day' updates the URL and fetches that period once", async () => {
    const { container } = renderView();
    await ready(container);
    fireEvent.click(screen.getByRole("button", { name: messages.period.oneDay }));
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const qs = new URLSearchParams(replaceSpy.mock.calls[0]![0].split("?")[1]);
    expect(qs.get("range")).toBe("1d");
    expect(Date.parse(qs.get("to")!) - Date.parse(qs.get("from")!)).toBe(DAY);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const second = new URL(urls()[1]!);
    expect(second.searchParams.get("from")).toBe(qs.get("from"));
    expect(second.searchParams.get("to")).toBe(qs.get("to"));
    expect(screen.getByRole("button", { name: messages.period.oneDay })).toHaveAttribute("aria-pressed", "true");
  });

  it("AC4: a custom range with start after end shows the error, flags the inputs and makes no request", async () => {
    const { container } = renderView();
    await ready(container);
    fireEvent.click(screen.getByRole("button", { name: messages.period.custom }));
    fireEvent.change(screen.getByLabelText(messages.period.start), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText(messages.period.end), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: messages.period.apply }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(messages.period.errors.startAfterEnd);
    const start = screen.getByLabelText(messages.period.start);
    expect(start).toHaveAttribute("aria-invalid", "true");
    expect(start.getAttribute("aria-describedby")).toBe(alert.id);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC4: a valid custom range is applied through the URL", async () => {
    const { container } = renderView();
    await ready(container);
    fireEvent.click(screen.getByRole("button", { name: messages.period.custom }));
    fireEvent.change(screen.getByLabelText(messages.period.start), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText(messages.period.end), { target: { value: "2026-09-03" } });
    fireEvent.click(screen.getByRole("button", { name: messages.period.apply }));
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const qs = new URLSearchParams(replaceSpy.mock.calls[0]![0].split("?")[1]);
    expect(qs.get("range")).toBe("custom");
    expect(qs.get("from")).toBe(new Date(2026, 8, 1).toISOString());
    expect(qs.get("to")).toBe(new Date(2026, 8, 4).toISOString());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AgentPerformanceView states (AC15, AC16, AC17)", () => {
  it("AC15: while loading no number, dollar or percent is shown and no data region renders", () => {
    respond = () => new Promise(() => undefined);
    const { container } = renderView();
    const root = container.querySelector("[data-agent-performance]")!;
    expect(root).toHaveAttribute("data-state", "loading");
    const busy = root.querySelector("[aria-busy]")!;
    expect(busy.textContent ?? "").not.toMatch(/\d|\$|%/);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(messages.kpi.totalRuns)).toBeNull();
    expect(root.querySelector("[data-cost-breakdown]")).toBeNull();
  });

  it("AC16: a failed load shows the error and Retry, no zero metrics; Retry fetches again", async () => {
    respond = () => jsonResponse({ error: { code: "internal_error", message: "boom" } }, 500);
    const { container } = renderView();
    await waitFor(() => expect(container.querySelector("[data-agent-performance]")).toHaveAttribute("data-state", "error"));
    expect(screen.getByText(messages.loadError)).toBeInTheDocument();
    const text = container.querySelector("[data-agent-performance]")!.textContent ?? "";
    expect(text).not.toContain("$0.00");
    expect(text).not.toContain("0%");
    expect(screen.queryByRole("table")).toBeNull();
    respond = () => jsonResponse(perf());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await ready(container);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("AC17: no runs anywhere shows the first-run empty state, without KPIs", async () => {
    respond = () => jsonResponse(perf({ agents: [] }, { runs: 0, has_any_runs: false, total_cost_usd: null }));
    const { container } = renderView();
    await waitFor(() => expect(container.querySelector("[data-agent-performance]")).toHaveAttribute("data-state", "empty"));
    expect(screen.getByText(messages.empty.noRunsTitle)).toBeInTheDocument();
    expect(screen.queryByText(messages.empty.noRunsInPeriodTitle)).toBeNull();
    expect(screen.queryByText(messages.kpi.totalRuns)).toBeNull();
  });

  it("AC17: runs exist but none in this period shows the wider-period empty state", async () => {
    respond = () => jsonResponse(perf({ agents: [] }, { runs: 0, has_any_runs: true, total_cost_usd: null }));
    const { container } = renderView();
    await waitFor(() => expect(container.querySelector("[data-agent-performance]")).toHaveAttribute("data-state", "empty"));
    expect(screen.getByText(messages.empty.noRunsInPeriodTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.empty.noRunsInPeriodBody)).toBeInTheDocument();
    expect(screen.queryByText(messages.empty.noRunsTitle)).toBeNull();
  });
});

describe("AgentPerformanceView table (AC13, AC14, AC18, AC20, AC21, AC23)", () => {
  const A = row({ agent_id: "a", agent_name: "Alpha", accept_rate: 0.9, decided: 20, runs: 7 });
  const B = row({ agent_id: "b", agent_name: "Bravo", accept_rate: 0.3, decided: 12, runs: 4 });
  const C = row({ agent_id: "c", agent_name: "Charlie", accept_rate: 1, decided: 1, runs: 2, previous_decided: 0, previous_accept_rate: null });

  it("AC13: the KPI and every row show 'N decisions' and the Runs cell equals runs", async () => {
    respond = () => jsonResponse(perf({ agents: [A, C] }, { decided: 21 }));
    const { container } = renderView();
    await ready(container);
    expect(within(container.querySelector('[data-kpi="avg-accept-rate"]') as HTMLElement).getByText("21 decisions")).toBeInTheDocument();
    expect(within(rowEl(container, "a")).getByText("20 decisions")).toBeInTheDocument();
    expect(within(rowEl(container, "c")).getByText("1 decision")).toBeInTheDocument();
    expect(within(rowEl(container, "a")).getAllByRole("cell")[1]).toHaveTextContent(/^7$/);
    expect(within(rowEl(container, "c")).getAllByRole("cell")[1]).toHaveTextContent(/^2$/);
  });

  it("AC14: Accept header sorts rows, aria-sort flips, small samples are flagged and idle rows stay last", async () => {
    const idle = row({ agent_id: "z", agent_name: "Zulu", runs: 0, accept_rate: null, decided: 0 });
    respond = () => jsonResponse(perf({ agents: [C, idle, B, A] }));
    const { container } = renderView();
    await ready(container);
    expect(rowOrder(container)).toEqual(["a", "b", "c", "z"]);
    // the columnheader's own accessible name is not exposed by dom-testing-library; reach it via its sort button
    const header = () => screen.getByRole("button", { name: messages.table.sortAccept }).closest("th") as HTMLElement;
    expect(header()).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: messages.table.sortAccept }));
    expect(rowOrder(container)).toEqual(["b", "a", "c", "z"]);
    expect(header()).toHaveAttribute("aria-sort", "ascending");
    // small sample badge: only rows with decided < 10 that have runs
    expect(rowEl(container, "c").querySelector("[data-small-sample]")).not.toBeNull();
    expect(within(rowEl(container, "c")).getByText("Small sample (n=1)")).toBeInTheDocument();
    expect(rowEl(container, "a").querySelector("[data-small-sample]")).toBeNull();
    expect(rowEl(container, "b").querySelector("[data-small-sample]")).toBeNull();
  });

  it("AC18: a row without runs says 'No runs in period' in Runs and a dash in the four other cells", async () => {
    const idle = row({ agent_id: "z", agent_name: "Zulu", runs: 0, accept_rate: null, decided: 0, avg_cost_usd: null, last_run_at: null });
    respond = () => jsonResponse(perf({ agents: [A, idle] }));
    const { container } = renderView();
    await ready(container);
    const cells = within(rowEl(container, "z")).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent(messages.table.noRunsInPeriod);
    expect([2, 3, 4, 5].map((i) => cells[i]!.textContent)).toEqual(["—", "—", "—", "—"]);
    const text = rowEl(container, "z").textContent ?? "";
    expect(text).not.toContain("0%");
    expect(text).not.toContain("$0.00");
  });

  it("AC21/AC20: expanding sets aria-expanded and shows severity, decisions and cost by model with no new fetch; only GETs happen", async () => {
    respond = () => jsonResponse(perf({ agents: [A, B] }));
    const { container } = renderView();
    await ready(container);
    const toggle = screen.getByRole("button", { name: "Show details for Alpha" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    const collapse = screen.getByRole("button", { name: "Hide details for Alpha" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    const details = container.querySelector("[data-agent-details]") as HTMLElement;
    expect(details).toHaveTextContent("Critical: 1");
    expect(details).toHaveTextContent("Warning: 2");
    expect(details).toHaveTextContent("Suggestion: 3");
    expect(details).toHaveTextContent("Accepted: 4");
    expect(details).toHaveTextContent("Dismissed: 1");
    expect(details).toHaveTextContent("Pending: 4");
    expect(details).toHaveTextContent("gpt-x: $0.35");
    fireEvent.click(collapse);
    expect(container.querySelector("[data-agent-details]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.table.sortAccept }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(methods().every((m) => m === "GET")).toBe(true);
  });

  it("AC23: the cost delta shows with a text sign when both totals exist and is absent when one is null", async () => {
    respond = () => jsonResponse(perf({ agents: [A] }));
    const first = renderView();
    await ready(first.container);
    expect(first.container.querySelector("[data-cost-delta]")).toHaveTextContent("+$0.30 vs previous period");
    cleanup();

    respond = () => jsonResponse(perf({ agents: [A] }, { previous_total_cost_usd: null }));
    const second = renderView();
    await ready(second.container);
    expect(second.container.querySelector("[data-cost-delta]")).toBeNull();
  });

  it("AC23: the trend marker needs >= 10 decisions in both periods and has an accessible name", async () => {
    const up = row({ agent_id: "u", agent_name: "Up", accept_rate: 0.8, previous_accept_rate: 0.5, decided: 20, previous_decided: 20 });
    const smallNow = row({ agent_id: "s", agent_name: "SmallNow", accept_rate: 0.8, previous_accept_rate: 0.5, decided: 9, previous_decided: 20 });
    const smallPrev = row({ agent_id: "p", agent_name: "SmallPrev", accept_rate: 0.8, previous_accept_rate: 0.5, decided: 20, previous_decided: 9 });
    respond = () => jsonResponse(perf({ agents: [up, smallNow, smallPrev] }));
    const { container } = renderView();
    await ready(container);
    expect(rowEl(container, "u").querySelector("[data-trend]")).not.toBeNull();
    expect(within(rowEl(container, "u")).getByRole("img", { name: messages.table.trendUp })).toBeInTheDocument();
    expect(rowEl(container, "s").querySelector("[data-trend]")).toBeNull();
    expect(rowEl(container, "p").querySelector("[data-trend]")).toBeNull();
  });

  it("the deleted-agent row is labelled and has no link; a single one exists even with several deleted agents upstream", async () => {
    const gone = row({ agent_id: null, agent_name: null, runs: 3 });
    respond = () => jsonResponse(perf({ agents: [A, gone] }));
    const { container } = renderView();
    await ready(container);
    const el = rowEl(container, "deleted");
    expect(within(el).getByText(messages.table.deletedAgent)).toBeInTheDocument();
    expect(within(el).queryByRole("link")).toBeNull();
    expect(within(rowEl(container, "a")).getByRole("link", { name: "Open Alpha" })).toHaveAttribute("href", "/agents/a");
  });

  it("untrusted names render as text and never as markup", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    respond = () =>
      jsonResponse(
        perf(
          { agents: [row({ agent_id: "e", agent_name: evil })], cost_by_agent: [{ label: evil, value: 0.5, kind: "agent", agent_id: "e" }] },
          { most_active_agent: evil, most_active: { agent_id: "e", agent_name: evil, runs: 7, accept_rate: 0.5, decided: 20 } },
        ),
      );
    const { container } = renderView();
    await ready(container);
    expect(within(rowEl(container, "e")).getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("EC18: 50 agents render 50 rows and every cost segment appears in the legend", async () => {
    const agents = Array.from({ length: 50 }, (_, i) => row({ agent_id: `id${i}`, agent_name: `Agent ${String(i).padStart(2, "0")}` }));
    const segs = agents.map((a, i) => ({ label: a.agent_name, value: 1 + i, kind: "agent" as const, agent_id: a.agent_id }));
    respond = () => jsonResponse(perf({ agents, cost_by_agent: segs, cost_by_model: [{ label: "gpt-x", value: 1, kind: "model" }] }));
    const { container } = renderView();
    await ready(container);
    expect(container.querySelectorAll("[data-agent-id]")).toHaveLength(50);
    expect(container.querySelectorAll("[data-cost-segment]")).toHaveLength(51);
  });
});

describe("AgentPerformanceView cost and estimate labelling (AC19, EC15)", () => {
  it("AC19: Estimated with its explanation appears on Total cost, the delta, the Avg cost header and the breakdown", async () => {
    const { container } = renderView();
    await ready(container);
    const totalCost = container.querySelector('[data-kpi="total-cost"]') as HTMLElement;
    expect(within(totalCost).getAllByText(messages.estimate.label).length).toBeGreaterThanOrEqual(2); // label + delta
    expect(within(totalCost).getByText(messages.estimate.explanation)).toBeInTheDocument();
    expect(container.querySelector("[data-cost-delta]")).toHaveTextContent(messages.estimate.label);
    expect(screen.getByRole("columnheader", { name: new RegExp(`${messages.table.avgCost}\\s+${messages.estimate.label}`) })).toBeInTheDocument();
    const breakdown = container.querySelector("[data-cost-breakdown]") as HTMLElement;
    expect(within(breakdown).getByText(messages.estimate.label)).toBeInTheDocument();
    expect(within(breakdown).getByText(messages.estimate.explanation)).toBeInTheDocument();
  });

  it("EC15: a real sub-cent cost is shown as <$0.0001, never as $0.00; a null total is a dash", async () => {
    respond = () =>
      jsonResponse(
        perf(
          { agents: [row({ agent_id: "a", agent_name: "Alpha", avg_cost_usd: 0.00004 })], cost_by_agent: [{ label: "Alpha", value: 0.00004, kind: "agent", agent_id: "a" }] },
          { total_cost_usd: 0.00004, previous_total_cost_usd: null },
        ),
      );
    const first = renderView();
    await ready(first.container);
    expect(within(first.container.querySelector('[data-kpi="total-cost"]') as HTMLElement).getByText("<$0.0001")).toBeInTheDocument();
    expect(within(rowEl(first.container, "a")).getAllByRole("cell")[2]).toHaveTextContent("<$0.0001");
    expect(first.container.querySelector("[data-cost-segment]")).toHaveTextContent("Alpha: <$0.0001 (100%)");
    cleanup();

    respond = () => jsonResponse(perf({ cost_by_agent: [], cost_by_model: [] }, { total_cost_usd: null, previous_total_cost_usd: null }));
    const second = renderView();
    await ready(second.container);
    expect(within(second.container.querySelector('[data-kpi="total-cost"]') as HTMLElement).getByText("—")).toBeInTheDocument();
    expect(screen.getAllByText(messages.breakdown.noCost)).toHaveLength(2);
  });
});

describe("AgentPerformanceView keyboard (NFR5)", () => {
  it("the expand toggle, sort button and picker controls are focusable", async () => {
    const { container } = renderView();
    await ready(container);
    for (const el of [
      screen.getByRole("button", { name: messages.period.oneDay }),
      screen.getByRole("button", { name: messages.period.thirtyDays }),
      screen.getByRole("button", { name: messages.period.custom }),
      screen.getByRole("button", { name: messages.table.sortAccept }),
      screen.getByRole("button", { name: "Show details for Alpha" }),
    ]) {
      el.focus();
      expect(el).toHaveFocus();
    }
    fireEvent.click(screen.getByRole("button", { name: messages.period.custom }));
    for (const el of [screen.getByLabelText(messages.period.start), screen.getByLabelText(messages.period.end), screen.getByRole("button", { name: messages.period.apply })]) {
      el.focus();
      expect(el).toHaveFocus();
    }
  });

  it("KPI ring and sparkline carry text alternatives", async () => {
    const { container } = renderView();
    await ready(container);
    expect(screen.getByRole("img", { name: "50% accept rate" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "7 runs, by day" })).toBeInTheDocument();
  });
});
