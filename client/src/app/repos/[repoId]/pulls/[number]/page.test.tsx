import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

let searchString = "";
let reviews: ReviewRecord[] = [];
const overviewProps = vi.fn();
const diffProps = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "482" }),
  useSearchParams: () => new URLSearchParams(searchString),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));
vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "p1", number: 482 }], isLoading: false }),
  usePullDetail: () => ({
    data: { number: 482, head_sha: "sha-1", body: "b", files: [{ path: "src/config.ts" }], files_count: 1, status: "open", commits: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviews, refetch: vi.fn() }),
  useCancelRun: () => ({ mutate: vi.fn() }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("./_components/PrDetailHeader", () => ({ PrDetailHeader: () => null }));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));
vi.mock("./_components/OverviewTab", () => ({
  OverviewTab: (p: Record<string, unknown>) => {
    overviewProps(p);
    return null;
  },
}));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: (p: Record<string, unknown>) => {
    diffProps(p);
    return null;
  },
}));

import PRDetailPage from "./page";

afterEach(() => {
  cleanup();
  overviewProps.mockClear();
  diffProps.mockClear();
  searchString = "";
  reviews = [];
});

const rv = (over: Record<string, unknown>) =>
  ({ id: "x", run_id: "x", findings: [], verdict: null, score: null, ...over }) as unknown as ReviewRecord;

describe("PR detail page", () => {
  it("F7g/P3: the Overview banner uses the newest review WITH a verdict, skipping a newer verdict-less one", () => {
    const summaryOnly = rv({ id: "newest", verdict: null });
    const verdict = rv({ id: "older", verdict: "request_changes", score: 61 });
    reviews = [summaryOnly, verdict, rv({ id: "oldest", verdict: "approve", score: 90 })]; // newest-first
    searchString = "tab=overview";
    render(<PRDetailPage />);
    const props = overviewProps.mock.calls.at(-1)![0] as { latestReview: ReviewRecord | null };
    expect(props.latestReview).toBe(verdict);
  });

  it("passes null when no review has a verdict", () => {
    reviews = [rv({ id: "a", verdict: null })];
    searchString = "tab=overview";
    render(<PRDetailPage />);
    expect((overviewProps.mock.calls.at(-1)![0] as { latestReview: unknown }).latestReview).toBeNull();
  });

  it("AC8: the diff tab receives ?file= and ?line= from the URL", () => {
    searchString = "tab=diff&file=src%2Fconfig.ts&line=12";
    render(<PRDetailPage />);
    expect(diffProps).toHaveBeenCalledWith(expect.objectContaining({ focusFile: "src/config.ts", focusLine: "12" }));
  });
});
