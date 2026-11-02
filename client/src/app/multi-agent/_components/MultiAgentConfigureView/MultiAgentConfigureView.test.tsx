import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import { ApiError } from "@/lib/api";

// ---- boundary mocks (repo overrides): hooks, navigation, AppShell ----
const h = vi.hoisted(() => ({
  agents: undefined as unknown,
  pulls: undefined as unknown,
  reviews: [] as unknown[],
  stats: {} as Record<string, unknown>,
  push: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  statsPeriods: [] as unknown[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "repo1" }) }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: h.agents }) }));
vi.mock("@/lib/hooks/core", () => ({ usePulls: () => ({ data: h.pulls }) }));
vi.mock("@/lib/hooks/agent-stats", () => ({
  useAgentsStats: (ids: string[], period: unknown) => {
    h.statsPeriods.push(period);
    return ids.map((id) => ({ data: h.stats[id] }));
  },
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: h.reviews }),
  useRunReview: () => ({ mutateAsync: h.mutateAsync, isPending: h.isPending }),
}));

import { MultiAgentConfigureView } from "./MultiAgentConfigureView";

const page = messages.page;

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <MultiAgentConfigureView />
    </NextIntlClientProvider>,
  );
}

const agent = (id: string, name: string, enabled = true) => ({ id, name, enabled });
const pull = (id: string, number: number, status = "needs_review") => ({ id, number, title: `PR ${number}`, status });

beforeEach(() => {
  h.agents = [agent("a1", "Security"), agent("a2", "Perf"), agent("a3", "Off", false)];
  h.pulls = [pull("p1", 1), pull("p2", 2), pull("p3", 3, "merged")];
  h.reviews = [];
  h.stats = {
    a1: { runs: 4, avg_latency_ms: 2000, avg_cost_usd: 0.02 },
    a2: { runs: 0, avg_latency_ms: null, avg_cost_usd: null },
  };
  h.push.mockReset();
  h.mutateAsync.mockReset().mockResolvedValue({});
  h.isPending = false;
  h.statsPeriods = [];
});
afterEach(cleanup);

const runButton = (n: number) => screen.getByRole("button", { name: page.configure.run.replace("{count}", String(n)) });

describe("MultiAgentConfigureView", () => {
  it("AC6: lists open PRs only and one card per enabled agent with summary and estimate", () => {
    h.reviews = [
      { id: "r2", agent_id: "a1", summary: "newest summary" },
      { id: "r1", agent_id: "a1", summary: "stale summary" },
    ];
    renderView();
    const select = screen.getByLabelText(page.configure.prLabel) as HTMLSelectElement;
    // fails if merged/closed PRs leak into the selector
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["#1 · PR 1", "#2 · PR 2"]);
    const group = screen.getByRole("group", { name: page.configure.agentsLabel });
    const cards = within(group).getAllByRole("checkbox");
    expect(cards).toHaveLength(2); // disabled agent "Off" absent
    expect(within(cards[0]!).getByText("Security")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("newest summary")).toBeInTheDocument();
    expect(screen.queryByText("stale summary")).not.toBeInTheDocument();
    expect(within(cards[0]!).getByText("≈ 2.0 s · $0.02")).toBeInTheDocument();
    // zero runs -> no estimate
    expect(within(cards[1]!).getByText(page.configure.noEstimate)).toBeInTheDocument();
  });

  it("AC6: requests stats over a 30-day period", () => {
    renderView();
    const period = h.statsPeriods[0] as { from?: string; to?: string; since?: string };
    expect(period).toBeDefined();
    const vals = Object.values(period).filter((v): v is string => typeof v === "string");
    const [a, b] = vals.map((v) => Date.parse(v)).filter((n) => !Number.isNaN(n));
    expect(Math.round(Math.abs(b! - a!) / 86_400_000)).toBe(30);
  });

  it("AC7: footer sums only selected agents that have an estimate and run button count follows selection", () => {
    renderView();
    expect(screen.queryByText(/sequential/)).not.toBeInTheDocument();
    expect(runButton(0)).toBeDisabled();
    const [c1, c2] = screen.getAllByRole("checkbox");
    fireEvent.click(c1!);
    expect(c1).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("≈ 2.0 s · $0.02 · sequential")).toBeInTheDocument();
    // selecting the agent with no estimate must not change the sums
    fireEvent.click(c2!);
    expect(screen.getByText("≈ 2.0 s · $0.02 · sequential")).toBeInTheDocument();
    expect(runButton(2)).toBeEnabled();
    fireEvent.click(c1!);
    expect(runButton(1)).toBeEnabled();
  });

  it("AC8: no enabled agent shows the empty state, link to /agents, no selector and no run button", () => {
    h.agents = [agent("a3", "Off", false)];
    renderView();
    expect(screen.getByText(page.noAgents.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: page.noAgents.cta })).toHaveAttribute("href", "/agents");
    expect(screen.queryByLabelText(page.configure.prLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run multi-agent review/ })).not.toBeInTheDocument();
  });

  it("AC5: submits agent_ids in selection order and navigates in the same order", async () => {
    renderView();
    const [c1, c2] = screen.getAllByRole("checkbox");
    fireEvent.click(c2!); // Perf first
    fireEvent.click(c1!);
    fireEvent.click(runButton(2));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/multi-agent/p1?agents=a2,a1"));
    expect(h.mutateAsync).toHaveBeenCalledTimes(1);
    expect(h.mutateAsync).toHaveBeenCalledWith({ prId: "p1", agentIds: ["a2", "a1"] });
  });

  it("AC5/EC1: run button is disabled while the request is pending", () => {
    h.isPending = true;
    renderView();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(runButton(1)).toBeDisabled();
  });

  it("EC2: a 429 shows the rate-limit message and does not navigate", async () => {
    h.mutateAsync.mockRejectedValue(new ApiError("slow down", 429));
    renderView();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(runButton(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(page.configure.rateLimited);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("AC5: Space on a focused card toggles it (keyboard)", () => {
    renderView();
    const c1 = screen.getAllByRole("checkbox")[0]!;
    c1.focus();
    fireEvent.keyDown(c1, { key: " " });
    expect(c1).toHaveAttribute("aria-checked", "true");
  });

  it("EC15: with no open PR the selector is disabled and the run button stays disabled", () => {
    h.pulls = [pull("p3", 3, "merged")];
    renderView();
    expect(screen.getByLabelText(page.configure.prLabel)).toBeDisabled();
    expect(screen.getByText(page.noRun.bodySelect)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(runButton(1)).toBeDisabled();
  });
});
