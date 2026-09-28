import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

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
