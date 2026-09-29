import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionScanState } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

// AppShell pulls in the full app chrome (Sidebar, RepoSwitcher, command
// palette…), which needs its own provider stack (QueryClient, theme, router).
// Stub it to a passthrough so this test stays focused on ConventionsView's
// own loading/error/empty/toolbar logic — same isolation idea as mocking a
// hooks module rather than exercising its real network calls.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

interface ConventionsQueryResult {
  data: { candidates: ConventionCandidate[]; scan: ConventionScanState } | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => void;
}

let queryResult: ConventionsQueryResult;
const runScanMutate = vi.fn();
const setStatusMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => queryResult,
  useRunConventionScan: () => ({ mutate: runScanMutate, isPending: false }),
  useSetConventionCandidateStatus: () => ({
    mutate: vi.fn(),
    mutateAsync: setStatusMutateAsync,
    isPending: false,
  }),
  useEditConventionCandidate: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  runScanMutate.mockClear();
  setStatusMutateAsync.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const SCAN_NEVER_RUN: ConventionScanState = {
  repo_id: "r1",
  status: "never_run",
  sampled_file_count: 0,
  candidate_count: 0,
};

function candidate(over: Partial<ConventionCandidate> & { id: string }): ConventionCandidate {
  return {
    repo_id: "r1",
    rule: "Always use async/await",
    evidence_path: "src/lib/api.ts",
    evidence_snippet: "export async function apiFetch() {}",
    evidence_start_line: 1,
    evidence_end_line: 3,
    confidence: 0.9,
    status: "pending",
    ...over,
  };
}

describe("ConventionsView", () => {
  it("shows skeleton rows while loading", () => {
    queryResult = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderWithIntl(<ConventionsView repoId="r1" />);
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("shows the error state with a retry action on failure", () => {
    const refetch = vi.fn();
    queryResult = { data: undefined, isLoading: false, isError: true, error: new Error("boom"), refetch };
    renderWithIntl(<ConventionsView repoId="r1" />);
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows the empty state when no scan has run and there are no candidates", () => {
    queryResult = {
      data: { candidates: [], scan: SCAN_NEVER_RUN },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderWithIntl(<ConventionsView repoId="r1" />);
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
  });

  it("hides Create skill until at least one candidate is accepted", () => {
    queryResult = {
      data: {
        candidates: [candidate({ id: "c1", status: "pending" })],
        scan: { ...SCAN_NEVER_RUN, status: "done", sampled_file_count: 40, candidate_count: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderWithIntl(<ConventionsView repoId="r1" />);
    expect(screen.queryByText("Create skill")).not.toBeInTheDocument();
  });

  it("enables Create skill once at least one candidate is accepted", () => {
    queryResult = {
      data: {
        candidates: [candidate({ id: "c1", status: "accepted" }), candidate({ id: "c2", status: "pending" })],
        scan: { ...SCAN_NEVER_RUN, status: "done", sampled_file_count: 40, candidate_count: 2 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderWithIntl(<ConventionsView repoId="r1" />);
    expect(screen.getByText("Create skill").closest("button")).not.toBeDisabled();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
  });
});
