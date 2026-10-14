import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// Tests that need a different trace swap this (reset to TRACE after each test).
let currentTrace: RunTrace = TRACE;

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: currentTrace, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  currentTrace = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("Project context section (SPEC-01 AC14, NFR12)", () => {
  const withContext = (): RunTrace => ({
    ...TRACE,
    prompt_assembly: {
      ...TRACE.prompt_assembly,
      specs: '<untrusted source="specs/a.md">\nDOC-A\n</untrusted>',
    },
    specs_read: ["specs/a.md", "docs/s.md"],
    project_context: [
      { path: "specs/a.md", origin: "agent", skill_name: null, status: "included", tokens: 120, text: "DOC-A-FULL-TEXT" },
      { path: "docs/s.md", origin: "skill", skill_name: "sec-skill", status: "included", tokens: 45, text: "DOC-S-TEXT" },
      { path: "docs/gone.md", origin: "agent", skill_name: null, status: "missing", tokens: null, text: null },
      { path: "docs/huge.md", origin: "agent", skill_name: null, status: "over_limit", tokens: null, text: null },
      { path: "../x.md", origin: "agent", skill_name: null, status: "rejected", tokens: null, text: null },
    ],
  });

  const openPromptAssembly = () => fireEvent.click(screen.getByText("Prompt assembly"));
  const entry = (path: string) => document.querySelector(`[data-project-context-entry="${path}"]`) as HTMLElement;

  it("lists one entry per item with its status label and ~N tok where tokens exist", () => {
    currentTrace = withContext();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    openPromptAssembly();

    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-project-context-entry]")).toHaveLength(5);

    expect(entry("specs/a.md")).toHaveAttribute("data-project-context-status", "included");
    expect(within(entry("specs/a.md")).getByText("included")).toBeInTheDocument();
    expect(within(entry("specs/a.md")).getByText("~120 tok")).toBeInTheDocument();
    expect(within(entry("docs/s.md")).getByText("via sec-skill")).toBeInTheDocument();
    expect(within(entry("docs/s.md")).getByText("~45 tok")).toBeInTheDocument();

    // status is text, not colour only
    expect(within(entry("docs/gone.md")).getByText("missing")).toBeInTheDocument();
    expect(within(entry("docs/huge.md")).getByText("over limit")).toBeInTheDocument();
    expect(within(entry("../x.md")).getByText("rejected")).toBeInTheDocument();
    expect(within(entry("docs/gone.md")).queryByText(/tok$/)).not.toBeInTheDocument();
  });

  it("expanding an included entry shows its exact text; collapsing hides it (real button with aria-expanded)", () => {
    currentTrace = withContext();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    openPromptAssembly();

    const toggle = screen.getByRole("button", { name: "Show text of specs/a.md" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("DOC-A-FULL-TEXT")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide text of specs/a.md" })).toHaveAttribute("aria-expanded", "true");
    const text = screen.getByText("DOC-A-FULL-TEXT");
    expect(text.tagName).toBe("PRE");

    fireEvent.click(screen.getByRole("button", { name: "Hide text of specs/a.md" }));
    expect(screen.queryByText("DOC-A-FULL-TEXT")).not.toBeInTheDocument();
  });

  it("a missing/rejected/over_limit entry shows its label, has no expand button and no text", () => {
    currentTrace = withContext();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    openPromptAssembly();
    for (const p of ["docs/gone.md", "docs/huge.md", "../x.md"]) {
      expect(within(entry(p)).queryByRole("button")).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /Show text of docs\/gone\.md/ })).not.toBeInTheDocument();
  });

  it("'Specs read' still lists the included paths", () => {
    currentTrace = withContext();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const row = screen.getByText("Specs read").parentElement!;
    expect(within(row).getByText("specs/a.md")).toBeInTheDocument();
    expect(within(row).getByText("docs/s.md")).toBeInTheDocument();
    expect(within(row).queryByText("docs/gone.md")).not.toBeInTheDocument();
  });

  it("an old stored trace without project_context renders with no section (NFR12)", () => {
    expect("project_context" in TRACE).toBe(false);
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    openPromptAssembly();
    expect(screen.getByText("User / diff (dynamic)")).toBeInTheDocument(); // section opened, blocks rendered
    expect(screen.queryByText("Project context — attached specs (untrusted)")).not.toBeInTheDocument();
    expect(document.querySelector("[data-project-context-entry]")).toBeNull();
  });

  it("project_context: null and [] also render no section", () => {
    for (const pc of [null, []]) {
      currentTrace = { ...TRACE, project_context: pc };
      const { unmount } = renderWithIntl(
        <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />,
      );
      openPromptAssembly();
      expect(screen.queryByText("Project context — attached specs (untrusted)")).not.toBeInTheDocument();
      unmount();
    }
  });
});
