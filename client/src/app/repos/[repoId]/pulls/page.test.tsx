import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../messages/en/prReview.json";

// AppShell needs its own provider stack (QueryClient, theme, router); stub it
// to a passthrough so this test stays on the page's own heading logic.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

interface PullsQueryResult {
  data: PrMeta[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => void;
}

let queryResult: PullsQueryResult;

vi.mock("@/lib/hooks", () => ({
  usePulls: () => queryResult,
  useRefreshRepo: () => ({ mutate: vi.fn(), isPending: false }),
}));

import PullsPage from "./page";

afterEach(() => {
  cleanup();
});

function pr(number: number, status: PrMeta["status"]): PrMeta {
  return {
    number,
    title: `PR number ${number}`,
    author: "octocat",
    branch: "feat",
    base: "main",
    head_sha: "abc123",
    additions: 1,
    deletions: 1,
    files_count: 1,
    status,
    updated_at: "2026-09-01T00:00:00Z",
  };
}

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PullsPage />
    </NextIntlClientProvider>,
  );
}

describe("PullsPage heading", () => {
  it("shows the count of visible rows, not of all loaded PRs", () => {
    queryResult = {
      data: [pr(1, "needs_review"), pr(2, "needs_review"), pr(3, "merged")],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Pull Requests (2)" })).toBeInTheDocument();
  });

  it("shows the plain title while loading", () => {
    queryResult = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderPage();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Pull Requests$/);
  });
});
