import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
// @testing-library/user-event is not installed in client (no new deps allowed): fireEvent is the click driver.
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingState, OnboardingTour } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ApiError } from "@/lib/api";
import { githubBlobUrl } from "@/lib/github-urls";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

interface QueryResult {
  data: OnboardingState | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => void;
}
let queryResult: QueryResult;
let generateState: { isPending: boolean; isError: boolean; error: unknown };
const generateMutate = vi.fn();
const resyncMutate = vi.fn();

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboarding: () => queryResult,
  useGenerateOnboarding: () => ({ mutate: generateMutate, ...generateState }),
  useResyncForOnboarding: () => ({ mutate: resyncMutate, isPending: false }),
}));

import { OnboardingView } from "./OnboardingView";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  generateState = { isPending: false, isError: false, error: null };
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  cleanup();
  generateMutate.mockClear();
  resyncMutate.mockClear();
  writeText.mockClear();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnboardingView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

const fmt = (tpl: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), tpl);

function tour(over: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    generated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    indexed_sha: "abc123",
    files_indexed: 321,
    index_status: "full",
    outcome: "ai",
    skeleton_reason: null,
    churn_available: true,
    truncated: false,
    dropped_paths: 0,
    model: "m",
    llm_calls: 1,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: null,
    sections: {
      architecture: {
        summary: "The **core** lives in src.",
        nodes: [
          { id: "a", label: "API", path: "src/api.ts" },
          { id: "b", label: "DB", path: null },
        ],
        edges: [{ from: "a", to: "b" }],
      },
      critical_paths: [{ path: "src/critical.ts", why: "entry" }],
      run_locally: [{ command: "pnpm install", note: null, source: "package.json" }],
      reading_path: [{ path: "src/read.ts", reason: "start here", score: 0.5 }],
      first_tasks: [{ title: "Fix a bug", why: "easy", paths: ["src/task.ts"] }],
    },
    ...over,
  };
}

function ready(t: OnboardingTour, over: Partial<OnboardingState> = {}): QueryResult {
  return {
    data: {
      status: "ready",
      job_id: null,
      index: { status: "full", usable: true, files_indexed: 321, last_indexed_sha: "abc123" },
      is_stale: false,
      tour: t,
      ...over,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function none(usable: boolean): QueryResult {
  return {
    data: {
      status: "none",
      job_id: null,
      index: { status: usable ? "full" : "degraded", usable, files_indexed: 0, last_indexed_sha: null },
      is_stale: false,
      tour: null,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

describe("AC2 empty state", () => {
  it("usable index: exactly one primary action, Generate, and no Resync", async () => {
    queryResult = none(true);
    renderView();
    expect(screen.getByText(messages.empty.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.empty.resync })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.actions.generate }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("unusable index: not-indexed message and exactly one action, Resync, no Generate", async () => {
    queryResult = none(false);
    renderView();
    expect(screen.getByText(messages.empty.notIndexedTitle)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.actions.generate })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.empty.resync }));
    expect(resyncMutate).toHaveBeenCalledTimes(1);
  });
});

describe("AC4 generating", () => {
  it("shows role=status, disables Regenerate and keeps the stored tour", () => {
    queryResult = ready(tour(), { status: "generating", job_id: "j1" });
    renderView();
    expect(screen.getByRole("status")).toHaveTextContent(messages.status.generating);
    expect(screen.getByRole("button", { name: messages.actions.regenerate })).toBeDisabled();
    expect(screen.queryByRole("button", { name: messages.actions.generate })).not.toBeInTheDocument();
    expect(screen.getByText("src/critical.ts")).toBeInTheDocument();
  });

  it("shows the status and no empty state when generating with no stored tour", () => {
    queryResult = { ...none(true), data: { ...none(true).data!, status: "generating", job_id: "j1" } };
    renderView();
    expect(screen.getByRole("status")).toHaveTextContent(messages.status.generating);
    expect(screen.queryByText(messages.empty.title)).not.toBeInTheDocument();
  });
});

describe("AC12 stored tour", () => {
  it("renders title, subtitle with file count, 5-anchor TOC and 5 expanded cards in order", () => {
    queryResult = ready(tour());
    renderView();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(fmt(messages.title, { name: "acme/widgets" }));
    expect(screen.getByText(/321 files/)).toBeInTheDocument();

    const toc = screen.getByRole("navigation", { name: messages.toc.title });
    expect(within(toc).getAllByRole("link")).toHaveLength(5);

    const s = messages.sections;
    const expected = [s.architecture, s.criticalPaths, s.runLocally, s.readingPath, s.firstTasks];
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(expected);
    for (const name of expected) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "true");
    }
  });

  it("collapses a card when its header button is activated", async () => {
    queryResult = ready(tour());
    renderView();
    const btn = screen.getByRole("button", { name: messages.sections.criticalPaths });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });
});

describe("AC13 status notes", () => {
  const note = (k: string) => document.querySelector(`[data-onboarding-note="${k}"]`);

  it("shows churnUnavailable only when churn_available is false", () => {
    queryResult = ready(tour({ churn_available: false }));
    renderView();
    expect(screen.getByText(messages.notes.churnUnavailable)).toBeInTheDocument();
    expect(screen.queryByText(messages.notes.stale)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.notes.partialIndex)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.notes.truncated)).not.toBeInTheDocument();
  });

  it("shows no note when no condition is true", () => {
    queryResult = ready(tour());
    renderView();
    expect(document.querySelector("[data-onboarding-note]")).toBeNull();
  });

  it("shows one note per true condition", () => {
    queryResult = ready(
      tour({ index_status: "partial", truncated: true, churn_available: false, outcome: "skeleton", skeleton_reason: "ai_failed" }),
      { is_stale: true },
    );
    renderView();
    expect(screen.getByText(messages.notes.stale)).toBeInTheDocument();
    expect(screen.getByText(messages.notes.partialIndex)).toBeInTheDocument();
    expect(screen.getByText(messages.notes.truncated)).toBeInTheDocument();
    expect(screen.getByText(messages.notes.churnUnavailable)).toBeInTheDocument();
    expect(screen.getByText(messages.notes.skeleton.ai_failed)).toBeInTheDocument();
    expect(note("skeleton.no_api_key")).toBeNull();
  });

  it("links to /settings/api-keys for the no_api_key reason only", () => {
    queryResult = ready(tour({ outcome: "skeleton", skeleton_reason: "no_api_key" }));
    renderView();
    expect(screen.getByText(messages.notes.skeleton.no_api_key, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.notes.settingsLink })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("has no settings link for other skeleton reasons", () => {
    queryResult = ready(tour({ outcome: "skeleton", skeleton_reason: "index_failed" }));
    renderView();
    expect(screen.queryByRole("link", { name: messages.notes.settingsLink })).not.toBeInTheDocument();
  });
});

describe("AC14 Open links", () => {
  it("points each file at the GitHub blob at indexed_sha in a new tab", () => {
    queryResult = ready(tour());
    renderView();
    for (const path of ["src/critical.ts", "src/read.ts", "src/task.ts"]) {
      const link = screen.getByRole("link", { name: fmt(messages.open, { path }) });
      expect(link).toHaveAttribute("href", githubBlobUrl("acme/widgets", "abc123", path));
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("hides Open links when indexed_sha is empty but keeps the path text", () => {
    queryResult = ready(tour({ indexed_sha: "" }));
    renderView();
    expect(screen.queryByRole("link", { name: fmt(messages.open, { path: "src/critical.ts" }) })).not.toBeInTheDocument();
    expect(screen.getByText("src/critical.ts")).toBeInTheDocument();
  });
});

describe("AC15 copy command", () => {
  it("writes the exact command to the clipboard and switches the button to copied", async () => {
    queryResult = ready(tour());
    renderView();
    expect(screen.getByText(messages.run.reviewBeforeRunning)).toBeInTheDocument();
    const copyName = fmt(messages.run.copy, { command: "pnpm install" });
    fireEvent.click(screen.getByRole("button", { name: copyName }));
    expect(writeText).toHaveBeenCalledWith("pnpm install");
    expect(await screen.findByRole("button", { name: fmt(messages.run.copied, { command: "pnpm install" }) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copyName })).not.toBeInTheDocument();
  });
});

describe("AC16 generate errors", () => {
  function failWith(err: unknown) {
    generateState = { isPending: false, isError: true, error: err };
    queryResult = ready(tour());
    renderView();
  }

  it("429 shows the rate-limit message and keeps the tour", () => {
    failWith(new ApiError("x", 429));
    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.rateLimited);
    expect(screen.getByText("src/critical.ts")).toBeInTheDocument();
  });

  it("409 repo_not_indexed shows the not-indexed message with Resync", async () => {
    failWith(new ApiError("x", 409, "repo_not_indexed"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(messages.errors.notIndexed);
    fireEvent.click(within(alert).getByRole("button", { name: messages.empty.resync }));
    expect(resyncMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("src/critical.ts")).toBeInTheDocument();
  });

  it("500 shows the generic message with Retry that regenerates", async () => {
    failWith(new ApiError("x", 500));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(messages.errors.generic);
    fireEvent.click(within(alert).getByRole("button", { name: messages.errors.retry }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("src/critical.ts")).toBeInTheDocument();
  });
});

describe("NFR5 / NFR6", () => {
  it("renders raw HTML in the summary inertly (no script or img elements)", () => {
    const t = tour();
    t.sections.architecture.summary = "hello <script>alert(1)</script> <img src=x onerror=alert(1)>";
    queryResult = ready(t);
    const { container } = renderView();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("exposes the full text of a long path via title", () => {
    const long = "src/" + "very-long-directory-name/".repeat(12) + "file.ts";
    const t = tour();
    t.sections.critical_paths = [{ path: long, why: null }];
    queryResult = ready(t);
    renderView();
    expect(screen.getByText(long)).toHaveAttribute("title", long);
  });

  it("gives the diagram a text alternative listing nodes and edges", () => {
    queryResult = ready(tour());
    renderView();
    const group = screen.getByRole("group", { name: messages.architecture.diagramAlt });
    const items = within(group).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toContain("API — src/api.ts");
    expect(items).toContain("DB");
    expect(within(group).getByText(fmt(messages.architecture.edge, { from: "API", to: "DB" }))).toBeInTheDocument();
  });

  it("includes the command and path in the copy and Open accessible names", () => {
    queryResult = ready(tour());
    renderView();
    expect(screen.getByRole("button", { name: /pnpm install/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /src\/read\.ts/ })).toBeInTheDocument();
  });
});
