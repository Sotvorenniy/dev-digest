import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

// Context tab: real context hooks over a mocked transport (assert the PUT).
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

// CodeMirror needs browser APIs jsdom doesn't implement (Range.getClientRects
// etc.) — stand in a plain textarea with the same value/onChange shape.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-codemirror-mock value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

// Mock the underlying hooks file (not the "@/lib/hooks" barrel) so every tab
// module in SkillEditor's static import tree resolves, even the ones this
// test never renders — same approach as AgentEditor.test.tsx.
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality",
  type: "rubric",
  source: "manual",
  body: "# Rule\nBe thorough.",
  enabled: true,
  version: 2,
  agent_count: 0,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillEditor Config tab (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
  });

  it("shows the unsaved badge only once the draft diverges from the saved skill", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
  });
});

describe("SkillEditor Preview tab (smoke)", () => {
  it("renders the saved body, not a draft", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={() => {}} />);
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByText("Be thorough.")).toBeInTheDocument();
  });
});

describe("SkillEditor Context tab (SPEC-01 AC8)", () => {
  const DOCS = {
    docs: [
      { path: "docs/a.md", type: "docs", size_bytes: 10, tokens: 120, used_by_agents: 0, updated_at: null },
      { path: "specs/b.md", type: "specs", size_bytes: 10, tokens: 197, used_by_agents: 1, updated_at: null },
      { path: "insights/c.md", type: "insights", size_bytes: 10, tokens: 5, used_by_agents: 0, updated_at: null },
    ],
    total_tokens: 322,
    search_roots: ["**/{specs,docs,insights}/**/*.md"],
    truncated: false,
  };

  function renderContextTab() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ skills: messages, context: contextMessages }}>
          <ToastProvider>
            <SkillEditor skill={SKILL} tab="context" onTab={() => {}} />
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

  it("has a Context tab titled 'Project context to use'", async () => {
    apiGet.mockImplementation(async (url: string) =>
      url.startsWith("/repos/") ? DOCS : { repo_id: "repo-1", paths: [], missing: [] },
    );
    renderContextTab();
    expect(screen.getByRole("button", { name: /Context/ })).toBeInTheDocument();
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(await screen.findByText("0 attached")).toBeInTheDocument();
  });

  it("shows '{n} attached' and a toggle issues PUT /skills/:id/context with the active repo_id", async () => {
    apiGet.mockImplementation(async (url: string) =>
      url.startsWith("/repos/") ? DOCS : { repo_id: "repo-1", paths: ["docs/a.md", "specs/b.md"], missing: [] },
    );
    apiPut.mockResolvedValue({ repo_id: "repo-1", paths: ["docs/a.md"] });
    renderContextTab();

    expect(await screen.findByText("2 attached")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/skills/sk1/context?repo_id=repo-1");

    fireEvent.click(screen.getByRole("checkbox", { name: "specs/b.md" }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(apiPut).toHaveBeenCalledWith("/skills/sk1/context", { repo_id: "repo-1", paths: ["docs/a.md"] });
    await waitFor(() => expect(screen.queryByText("Saving…")).not.toBeInTheDocument());
  });

  it("without an active repo it asks the user to select one", () => {
    activeRepoId = null;
    renderContextTab();
    expect(screen.getByText("Select a repository to attach project context.")).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
