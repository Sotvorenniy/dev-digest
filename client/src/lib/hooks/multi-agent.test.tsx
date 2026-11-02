import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentColumn, MultiAgentRun } from "@/lib/types";

// Boundary mock: the HTTP client only. The real hook and TanStack Query run.
const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: apiMock.get } };
});

import { multiAgentKey, multiAgentRefetchInterval, useMultiAgentRun } from "./multi-agent";

const col = (status: AgentColumn["status"]): AgentColumn => ({
  run_id: status === "none" ? null : "r",
  agent_id: `a-${status}`,
  agent_name: status,
  provider: null,
  model: null,
  status,
  error: null,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: null,
  cost_usd: null,
  findings: [],
});

const run = (statuses: AgentColumn["status"][]): MultiAgentRun => ({
  id: null,
  pr_id: "p",
  pr_number: 1,
  ran_at: null,
  agent_count: statuses.length,
  total_duration_ms: 0,
  total_cost_usd: null,
  columns: statuses.map(col),
  conflicts: [],
});

beforeEach(() => apiMock.get.mockReset());
afterEach(cleanup);

describe("multiAgentRefetchInterval (AC11)", () => {
  it("polls every 4 s while any column is running — fails if polling stops or exceeds the 5 s budget", () => {
    expect(multiAgentRefetchInterval(run(["done", "running", "none"]))).toBe(4000);
  });

  it("stops polling once no column is running — fails if it polls forever", () => {
    expect(multiAgentRefetchInterval(run(["done", "failed", "cancelled", "none"]))).toBe(false);
  });

  it("does not poll before the first response", () => {
    expect(multiAgentRefetchInterval(undefined)).toBe(false);
  });
});

describe("multiAgentKey / useMultiAgentRun (AC9)", () => {
  it("keys on pr and ordered agent list — fails if order is ignored", () => {
    expect(multiAgentKey("p", ["b", "a"])).not.toEqual(multiAgentKey("p", ["a", "b"]));
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }

  it("requests the agents in URL order, comma-joined, and returns the payload", async () => {
    apiMock.get.mockResolvedValue(run(["done"]));
    const { result } = renderHook(() => useMultiAgentRun("p1", ["b", "a"]), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(apiMock.get).toHaveBeenCalledWith("/pulls/p1/multi-agent?agents=b,a");
    expect(result.current.data?.columns).toHaveLength(1);
  });

  it("does not fetch with an empty agent list — fails if enabled is dropped", async () => {
    const { result } = renderHook(() => useMultiAgentRun("p1", []), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});
