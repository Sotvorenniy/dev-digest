/**
 * RunCostBadge — the money formatting is the whole point, so it is pinned here.
 * The rule that matters: an unknown cost is "—", never "$0.00". A run that never
 * reached the model is unknown, not free.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost, formatTokensTotal } from "./helpers";

afterEach(cleanup);

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("formatCost", () => {
  it.each([
    // The three values the designs call for, from one formatter.
    [0.0013, "$0.0013"],
    [0.014, "$0.014"],
    [0.06, "$0.06"],
    // Trailing zeros trim down to a 2dp floor, never below it.
    [1.5, "$1.50"],
    [2, "$2.00"],
    [0.041, "$0.041"],
    // A priced-at-zero model really is free — that IS a fact.
    [0, "$0.00"],
    // Cheap OpenRouter models land below 4dp. These must NOT collapse to
    // "$0.00", which would report a paid run as free.
    [0.000034, "<$0.0001"],
    [0.0000004, "<$0.0001"],
    [0.00009999, "<$0.0001"],
    // Just at/above the threshold, normal formatting resumes.
    [0.0001, "$0.0001"],
    [0.00018088, "$0.0002"],
  ])("formats %s as %s", (usd, expected) => {
    expect(formatCost(usd)).toBe(expected);
  });

  it("keeps free and too-small-to-show distinguishable", () => {
    // ~22 OpenRouter models are genuinely $0/$0, so both states occur in
    // practice and must never render identically.
    expect(formatCost(0)).not.toBe(formatCost(0.000034));
  });

  it.each([null, undefined, NaN])("renders an em dash for %s", (usd) => {
    expect(formatCost(usd)).toBe("—");
  });
});

describe("formatTokensTotal", () => {
  it("sums both directions and groups the total", () => {
    expect(formatTokensTotal(8000, 1119)).toBe("9 119");
  });

  it("returns null when the run reported no usage", () => {
    expect(formatTokensTotal(null, null)).toBeNull();
    expect(formatTokensTotal(0, 0)).toBeNull();
  });
});

describe("RunCostBadge — cell variant (PR list)", () => {
  it("shows the PR total", () => {
    renderBadge(<RunCostBadge variant="cell" usd={0.014} />);
    expect(screen.getByText("$0.014")).toBeTruthy();
  });

  it("shows an em dash for a PR that was never reviewed", () => {
    renderBadge(<RunCostBadge variant="cell" usd={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("RunCostBadge — inline variant (run timeline)", () => {
  it("renders tokens and cost together", () => {
    const { container } = renderBadge(
      <RunCostBadge variant="inline" usd={0.0013} tokensIn={8000} tokensOut={1119} />,
    );
    expect(container.textContent).toBe("9 119 tok · $0.0013");
  });

  it("keeps the cost slot as an em dash when the model has no known price", () => {
    const { container } = renderBadge(
      <RunCostBadge variant="inline" usd={null} tokensIn={8000} tokensOut={1119} />,
    );
    expect(container.textContent).toBe("9 119 tok · —");
  });

  it("drops the token half when the run reported no usage", () => {
    const { container } = renderBadge(
      <RunCostBadge variant="inline" usd={null} tokensIn={0} tokensOut={0} />,
    );
    expect(container.textContent).toBe("—");
  });
});
