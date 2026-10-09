import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius as BlastRadiusData } from "@/lib/types";
import messages from "../../../../../../../../../../messages/en/blast.json";

interface BlastQuery {
  data?: BlastRadiusData;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}
let query: BlastQuery;
const refetch = vi.fn();
const resyncMutate = vi.fn();
let resyncState = { isPending: false, isSuccess: false };
let statusData: { lastIndexedSha: string; updatedAt: string } | undefined;

vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: () => query }));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: statusData }),
  useResyncRepoIntel: () => ({ mutate: resyncMutate, ...resyncState }),
}));

import { BlastRadius } from "./BlastRadius";

const ready: BlastRadiusData = {
  changed_symbols: [
    { name: "rateLimit", file: "src/rate.ts", kind: "function" },
    { name: "other", file: "src/other.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "publicRouter", file: "src/router.ts", line: 23 },
        { name: "cronJob", file: "src/jobs.ts", line: 5 },
      ],
      endpoints_affected: ["GET /api/x"],
      crons_affected: ["nightly-sync"],
    },
    { symbol: "other", callers: [{ name: "hidden", file: "src/h.ts", line: 9 }], endpoints_affected: [], crons_affected: [] },
  ],
  summary: "2 symbols, 3 callers, 1 endpoints, 1 crons",
  degraded: false,
  degraded_reason: null,
};

function renderBlock(repoFullName: string | null = "o/r") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadius prId="p1" repoId="r1" repoFullName={repoFullName} headSha="abc123" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  refetch.mockReset();
  resyncMutate.mockReset();
  resyncState = { isPending: false, isSuccess: false };
  statusData = undefined;
});

describe("BlastRadius", () => {
  it("shows a loading state", () => {
    query = { isLoading: true, isError: false, refetch };
    const { container } = renderBlock();
    expect(container.querySelector("[data-blast-loading]")).toBeTruthy();
  });

  it("shows an error with a working retry", () => {
    query = { isLoading: false, isError: true, refetch };
    const { container } = renderBlock();
    expect(container.querySelector("[data-blast-error]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: messages.retry }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders summary chips, opens the first symbol and links callers to the head sha line", () => {
    query = { data: ready, isLoading: false, isError: false, refetch };
    const { container } = renderBlock();
    expect(container.querySelector("[data-blast-stat='symbols']")!.textContent).toContain("2");
    expect(container.querySelector("[data-blast-stat='callers']")!.textContent).toContain("3");
    expect(container.querySelector("[data-blast-stat='endpoints']")!.textContent).toContain("1");
    expect(container.querySelector("[data-blast-stat='crons']")!.textContent).toContain("1");
    const first = container.querySelector("[data-blast-symbol='rateLimit'] button")!;
    expect(first.getAttribute("aria-expanded")).toBe("true");
    const link = screen.getByText("src/router.ts:23") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/blob/abc123/src/router.ts#L23");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("GET /api/x")).toBeTruthy();
    expect(container.querySelector("[data-blast-crons]")!.textContent).toContain("nightly-sync");
    expect(container.querySelector("[data-blast-endpoints]")!.textContent).not.toContain("nightly-sync");
  });

  it("collapses and expands a symbol group", () => {
    query = { data: ready, isLoading: false, isError: false, refetch };
    const { container } = renderBlock();
    expect(screen.queryByText("hidden")).toBeNull();
    const second = container.querySelector("[data-blast-symbol='other'] button")!;
    expect(second.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(second);
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("hidden")).toBeTruthy();
    const first = container.querySelector("[data-blast-symbol='rateLimit'] button")!;
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders callers as plain text when the repo is unknown", () => {
    query = { data: ready, isLoading: false, isError: false, refetch };
    renderBlock(null);
    expect(screen.getByText("src/router.ts:23").tagName).toBe("SPAN");
  });

  it("shows the empty state (not degraded) when nothing calls the changed symbols", () => {
    query = {
      data: { changed_symbols: [{ name: "a", file: "a.ts", kind: "function" }], downstream: [], summary: "", degraded: false },
      isLoading: false,
      isError: false,
      refetch,
    };
    const { container } = renderBlock();
    expect(container.querySelector("[data-blast-empty]")!.textContent).toBe("1 changed symbol(s), no downstream callers found.");
    expect(container.querySelector("[data-blast-degraded]")).toBeNull();
  });

  it("shows the degraded badge with its reason, partial data and a resync button", () => {
    query = {
      data: { ...ready, degraded: true, degraded_reason: "index_partial" },
      isLoading: false,
      isError: false,
      refetch,
    };
    const { container } = renderBlock();
    expect(container.querySelector("[data-blast-degraded='index_partial']")).toBeTruthy();
    expect(screen.getByText(messages.degraded.reason.indexPartial)).toBeTruthy();
    expect(container.querySelector("[data-blast-symbol='rateLimit']")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: messages.resync }));
    expect(resyncMutate).toHaveBeenCalled();
  });

  it("falls back to the unknown reason text and disables resync while it runs", () => {
    query = {
      data: { changed_symbols: [], downstream: [], summary: "", degraded: true, degraded_reason: null },
      isLoading: false,
      isError: false,
      refetch,
    };
    resyncState = { isPending: true, isSuccess: false };
    renderBlock();
    expect(screen.getByText(messages.degraded.reason.unknown)).toBeTruthy();
    const btn = screen.getByRole("button", { name: messages.resyncing }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("refetches and clears the resync notice once the index stamp changes", () => {
    query = {
      data: { ...ready, degraded: true, degraded_reason: "index_partial" },
      isLoading: false,
      isError: false,
      refetch,
    };
    statusData = { lastIndexedSha: "sha1", updatedAt: "t1" };
    const ui = () => (
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadius prId="p1" repoId="r1" repoFullName="o/r" headSha="abc123" />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: messages.resync }));
    expect(resyncMutate).toHaveBeenCalled();

    // Mutation accepted: waiting for the index to advance.
    resyncState = { isPending: false, isSuccess: true };
    rerender(ui());
    expect(screen.getByText(messages.resyncQueued)).toBeTruthy();
    expect((screen.getByRole("button", { name: messages.resyncing }) as HTMLButtonElement).disabled).toBe(true);
    expect(refetch).not.toHaveBeenCalled();

    // Same stamp: still waiting.
    statusData = { lastIndexedSha: "sha1", updatedAt: "t1" };
    rerender(ui());
    expect(refetch).not.toHaveBeenCalled();

    // Stamp advanced: resync finished.
    statusData = { lastIndexedSha: "sha2", updatedAt: "t2" };
    rerender(ui());
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(messages.resyncQueued)).toBeNull();
    expect((screen.getByRole("button", { name: messages.resync }) as HTMLButtonElement).disabled).toBe(false);
  });
});
