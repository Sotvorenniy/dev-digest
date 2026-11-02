import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ApiError } from "../../../../../../../lib/api";

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "first", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "second", name: "Style", model: "gpt-4.1", enabled: true },
      { id: "off", name: "Disabled", model: "gpt-4.1", enabled: false },
    ],
  }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
});
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function openPanel() {
  renderWithIntl(<RunReviewDropdown prId="pr1" />);
  fireEvent.click(screen.getByText("Run Review"));
}

function check(id: string) {
  const box = document.querySelector(`[data-agent-option="${id}"] [role="checkbox"]`)!;
  fireEvent.click(box);
}

describe("RunReviewDropdown", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("lists only enabled agents and disables run at 0 selected", () => {
    openPanel();
    expect(document.querySelector('[data-agent-option="off"]')).toBeNull();
    expect(document.querySelectorAll("[data-agent-option]")).toHaveLength(2);
    expect(screen.getByText("Run multi-agent review (0)").closest("button")).toBeDisabled();
  });

  it("updates N and Clear unchecks all", () => {
    openPanel();
    check("first");
    expect(screen.getByText("Run multi-agent review (1)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByText("Run multi-agent review (0)")).toBeInTheDocument();
  });

  it("submits in click order and navigates", async () => {
    mutateAsync.mockResolvedValue({ runs: [{ run_id: "r1" }] });
    openPanel();
    check("second");
    check("first");
    fireEvent.click(screen.getByText("Run multi-agent review (2)"));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["second", "first"] });
    expect(push).toHaveBeenCalledWith("/multi-agent/pr1?agents=second,first");
  });

  it("shows a message on 429 and does not navigate", async () => {
    mutateAsync.mockRejectedValue(new ApiError("rate", 429));
    openPanel();
    check("first");
    fireEvent.click(screen.getByText("Run multi-agent review (1)"));
    await screen.findByText(messages.runReview.rateLimited);
    expect(push).not.toHaveBeenCalled();
  });
});
