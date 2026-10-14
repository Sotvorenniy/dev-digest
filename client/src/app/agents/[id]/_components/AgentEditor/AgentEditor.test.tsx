import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

// Context tab: the real context hooks run over a mocked transport, so the PUT
// url and body are what the tests assert (not "a mock was called").
const apiGet = vi.fn();
const apiPut = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { get: (...a: unknown[]) => apiGet(...a), put: (...a: unknown[]) => apiPut(...a) },
}));

let activeRepoId: string | null = "repo-1";
vi.mock("@/lib/repo-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repo-context")>()),
  useActiveRepo: () => ({ repoId: activeRepoId, activeRepo: null }),
}));

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });
});

function rerenderWith(
  rerender: (ui: React.ReactElement) => void,
  agent: Agent,
): void {
  rerender(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <AgentEditor agent={agent} tab="config" onTab={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("draft lifetime is tied to the agent identity", () => {
  it("re-seeds the form when switching to a different agent", () => {
    const { rerender } = renderWithIntl(
      <AgentEditor agent={AGENT} tab="config" onTab={() => {}} />,
    );
    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();

    rerenderWith(rerender, { ...AGENT, id: "ag2", name: "Perf Reviewer" });

    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Security Reviewer")).not.toBeInTheDocument();
  });

  it("keeps the draft when the same agent is refetched", () => {
    // Deliberate: a background refetch must not overwrite what the user is
    // typing. The trade-off is that a change made elsewhere (e.g. the sidebar
    // enabled toggle) is not reflected until the editor is reopened — see the
    // note in ConfigTab.
    const { rerender } = renderWithIntl(
      <AgentEditor agent={AGENT} tab="config" onTab={() => {}} />,
    );
    rerenderWith(rerender, { ...AGENT, name: "Renamed Elsewhere" });

    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();
  });
});

describe("Context tab (SPEC-01 AC6 client save, AC7)", () => {
  const DOCS = {
    docs: [
      { path: "docs/a.md", type: "docs", size_bytes: 10, tokens: 120, used_by_agents: 0, updated_at: null },
      { path: "specs/b.md", type: "specs", size_bytes: 10, tokens: 197, used_by_agents: 1, updated_at: null },
    ],
    total_tokens: 317,
    search_roots: ["**/{specs,docs,insights}/**/*.md"],
    truncated: false,
  };

  function renderContextTab(tab = "context") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages, context: contextMessages }}>
          <ToastProvider>
            <AgentEditor agent={AGENT} tab={tab} onTab={() => {}} />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  afterEach(() => {
    apiGet.mockReset();
    apiPut.mockReset();
    activeRepoId = "repo-1";
  });

  it("lists a Context tab next to Config", () => {
    apiGet.mockResolvedValue(DOCS);
    renderContextTab("config");
    expect(screen.getByRole("button", { name: /Context/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Config/ })).toBeInTheDocument();
  });

  it("shows attached count and tokens; one toggle issues one PUT /agents/:id/context with the active repo_id", async () => {
    apiGet.mockImplementation(async (url: string) =>
      url.startsWith("/repos/") ? DOCS : { repo_id: "repo-1", paths: ["docs/a.md"], missing: [] },
    );
    apiPut.mockResolvedValue({ repo_id: "repo-1", paths: ["docs/a.md", "specs/b.md"] });
    renderContextTab();

    expect(await screen.findByText("1 of 2 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 120 tokens per prompt")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/agents/ag1/context?repo_id=repo-1");

    fireEvent.click(screen.getByRole("checkbox", { name: "specs/b.md" }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut).toHaveBeenCalledWith("/agents/ag1/context", {
      repo_id: "repo-1",
      paths: ["docs/a.md", "specs/b.md"],
    });
    // let the mutation settle (refetch + saving flag) before the test ends
    await waitFor(() => expect(screen.queryByText("Saving…")).not.toBeInTheDocument());
  });

  it("without an active repo it asks the user to select one and makes no request", () => {
    activeRepoId = null;
    renderContextTab();
    expect(screen.getByText("Select a repository to attach project context.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("a failed load shows the error state with Retry", async () => {
    apiGet.mockRejectedValue(new Error("boom"));
    renderContextTab();
    expect(await screen.findByText("Couldn’t load project context")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
