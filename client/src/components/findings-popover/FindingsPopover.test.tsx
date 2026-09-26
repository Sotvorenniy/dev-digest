import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { CLOSE_DELAY_MS } from "./constants";
import { FindingsPopover, type FindingPreviewLike } from ".";

afterEach(cleanup);

function preview(over: Partial<FindingPreviewLike> & { id: string }): FindingPreviewLike {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    confidence: 0.98,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    ...over,
  };
}

function renderPopover(findings: FindingPreviewLike[]) {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsPopover findings={findings}>
        <span>chips</span>
      </FindingsPopover>
    </NextIntlClientProvider>,
  );
  return { ...utils, trigger: screen.getByText("chips").parentElement! };
}

/** The panel is portaled to <body>, so it is never inside `container`. */
function panel(): HTMLElement | null {
  return document.body.querySelector('[style*="position: fixed"]');
}

describe("FindingsPopover", () => {
  it("stays closed until the trigger is hovered", () => {
    const { trigger } = renderPopover([preview({ id: "a" })]);
    expect(screen.queryByText(/FINDINGS IN THIS RUN/)).not.toBeInTheDocument();
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();
  });

  it("heads the panel with the number of findings it actually lists", () => {
    const { trigger } = renderPopover([
      preview({ id: "a" }),
      preview({ id: "b" }),
      preview({ id: "c" }),
    ]);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("3 FINDINGS IN THIS RUN")).toBeInTheDocument();
    expect(panel()!.querySelectorAll('[style*="border-bottom"]').length).toBeGreaterThan(0);
  });

  it("shows title, category, file:line and confidence per finding", () => {
    const { trigger } = renderPopover([preview({ id: "a" })]);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
  });

  it("collapses a single-line range and keeps a multi-line one", () => {
    const { trigger } = renderPopover([
      preview({ id: "a", file: "src/one.ts", start_line: 5, end_line: 5 }),
      preview({ id: "b", file: "src/many.ts", start_line: 45, end_line: 52 }),
    ]);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("src/one.ts:5")).toBeInTheDocument();
    expect(screen.getByText("src/many.ts:45-52")).toBeInTheDocument();
  });

  it("is read-only — no buttons or links anywhere in the panel", () => {
    const { trigger } = renderPopover([preview({ id: "a" }), preview({ id: "b" })]);
    fireEvent.mouseEnter(trigger);
    expect(panel()!.querySelectorAll("button")).toHaveLength(0);
    expect(panel()!.querySelectorAll("a")).toHaveLength(0);
  });

  it("renders nothing for a run that found nothing", () => {
    const { trigger } = renderPopover([]);
    fireEvent.mouseEnter(trigger);
    expect(panel()).toBeNull();
  });

  it("survives the cursor crossing the gap into the panel, then closes on leave", async () => {
    const { trigger } = renderPopover([preview({ id: "a" })]);
    fireEvent.mouseEnter(trigger);

    // Leaving the chips heads for the panel — the grace period keeps it open.
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(panel()!);
    await act(() => new Promise((r) => setTimeout(r, CLOSE_DELAY_MS + 20)));
    expect(screen.getByText("1 FINDINGS IN THIS RUN")).toBeInTheDocument();

    fireEvent.mouseLeave(panel()!);
    await act(() => new Promise((r) => setTimeout(r, CLOSE_DELAY_MS + 20)));
    expect(screen.queryByText("1 FINDINGS IN THIS RUN")).not.toBeInTheDocument();
  });
});
