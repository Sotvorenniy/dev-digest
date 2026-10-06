import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@/lib/types";
import messages from "../../../../../../../../../../messages/en/intent.json";

let intent: PrIntentRecord | null | undefined;
const mutate = vi.fn();

vi.mock("@/lib/hooks/intent", () => ({
  useIntent: () => ({ data: intent, isLoading: false }),
  useDeriveIntent: () => ({ mutate, isPending: false, isError: false }),
}));

import { IntentCard } from "./IntentCard";

const base = {
  pr_id: "p1",
  intent: "Adds rate limiting to the public API",
  in_scope: ["limiter middleware"],
  out_of_scope: ["billing"],
  change_type: "feature",
  confidence: 0.8,
  basis: "documented",
  requirements: [],
  sources: [{ id: "description-1", kind: "description", ref: "PR description", fetched: true }],
} as unknown as PrIntentRecord;

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      <IntentCard prId="p1" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

describe("IntentCard", () => {
  it("renders the intent, both scope lists, and source hooks", () => {
    intent = base;
    const { container } = renderCard();
    expect(screen.getByText(/Adds rate limiting/)).toBeTruthy();
    expect(screen.getByText("limiter middleware")).toBeTruthy();
    expect(screen.getByText("billing")).toBeTruthy();
    expect(container.querySelector("[data-intent-card]")).toBeTruthy();
    expect(container.querySelector("[data-intent-basis='documented']")).toBeTruthy();
    expect(container.querySelector("[data-intent-source='description-1']")).toBeTruthy();
  });

  it("warns that conformance is unverified when a linked spec was not fetched", () => {
    intent = {
      ...base,
      sources: [{ id: "spec-1", kind: "spec", ref: "docs/spec.md", fetched: false }],
    } as unknown as PrIntentRecord;
    renderCard();
    expect(screen.getByText(messages.specUnverified)).toBeTruthy();
  });

  it("derives on demand: first run is not forced, a re-run is", () => {
    intent = null;
    const first = renderCard();
    fireEvent.click(first.getByRole("button"));
    expect(mutate).toHaveBeenLastCalledWith(false);
    cleanup();
    intent = base;
    renderCard();
    fireEvent.click(screen.getByRole("button"));
    expect(mutate).toHaveBeenLastCalledWith(true);
  });
});
