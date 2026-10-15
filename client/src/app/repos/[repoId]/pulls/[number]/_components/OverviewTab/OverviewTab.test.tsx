import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

const briefProps = vi.fn();
vi.mock("./_components/PrBriefCard", () => ({
  PrBriefCard: (p: Record<string, unknown>) => {
    briefProps(p);
    return <section data-pr-brief />;
  },
}));
vi.mock("./_components/IntentCard", () => ({ IntentCard: () => <section data-intent-card /> }));
vi.mock("./_components/BlastRadius", () => ({ BlastRadius: () => <section data-blast-card /> }));

import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  briefProps.mockClear();
});

const REVIEW = { id: "rv", verdict: "approve" } as unknown as ReviewRecord;

function renderTab(over: Partial<React.ComponentProps<typeof OverviewTab>> = {}) {
  return render(
    <OverviewTab
      prBody="The PR description"
      prId="p1"
      repoId="r1"
      repoFullName="o/r"
      headSha="sha-1"
      prNumber={482}
      hasFiles
      latestReview={REVIEW}
      {...over}
    />,
  );
}

describe("OverviewTab", () => {
  it("AC1: the brief comes first, then intent, blast radius and the description", () => {
    const { container } = renderTab();
    const order = [...container.children].map((el) =>
      el.hasAttribute("data-pr-brief")
        ? "brief"
        : el.hasAttribute("data-intent-card")
          ? "intent"
          : el.hasAttribute("data-blast-card")
            ? "blast"
            : "description",
    );
    expect(order).toEqual(["brief", "intent", "blast", "description"]);
    expect(screen.getByText("The PR description")).toBeInTheDocument();
  });

  it("hands the card the PR facts and the review it should banner", () => {
    renderTab();
    expect(briefProps).toHaveBeenCalledWith(
      expect.objectContaining({
        prId: "p1",
        repoId: "r1",
        prNumber: 482,
        headSha: "sha-1",
        hasFiles: true,
        latestReview: REVIEW,
      }),
    );
  });

  it("omits the description section when the PR has no body", () => {
    renderTab({ prBody: null });
    expect(screen.queryByText("Description")).toBeNull();
  });
});
