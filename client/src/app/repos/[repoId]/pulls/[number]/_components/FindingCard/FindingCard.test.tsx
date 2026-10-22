import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FindingCard } from "./FindingCard";

// Boundary mock: the HTTP client only. Real hooks and the real EvalCaseAction render.
const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: apiMock.get, post: apiMock.post } };
});
import { ApiError } from "@/lib/api";

const AGENTS = [
  { id: "a1", name: "Security Reviewer" },
  { id: "a2", name: "Performance Reviewer" },
];

beforeEach(() => {
  apiMock.get.mockReset().mockResolvedValue(AGENTS);
  apiMock.post.mockReset();
});

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard: Turn into eval case", () => {
  const decided: FindingRecord = { ...FINDING, accepted_at: "2026-10-01T00:00:00Z" };
  const turnInto = () => screen.getByRole("button", { name: evalMessages.findingAction.turnInto });
  const CASE = { id: "c1", owner_id: "a1" };

  it("is disabled with an aria-describedby reason while the finding is undecided", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded reviewAgentId="a1" />);
    const btn = turnInto();
    expect(btn).toBeDisabled();
    const reason = document.getElementById(btn.getAttribute("aria-describedby")!);
    expect(reason).toHaveTextContent(evalMessages.findingAction.undecidedReason);
    fireEvent.click(btn);
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("a decided finding with an existing agent POSTs with no body and shows the created label", async () => {
    apiMock.post.mockResolvedValue(CASE);
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/agents"));
    // agents are loaded asynchronously; wait until the own-agent path is known
    await waitFor(() => expect(turnInto()).toBeEnabled());
    await screen.findByRole("button", { name: evalMessages.findingAction.turnInto });
    fireEvent.click(turnInto());
    expect(await screen.findByText(evalMessages.findingAction.created)).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith("/findings/f1/eval-case", undefined);
    expect(screen.queryByText(evalMessages.findingAction.pickAgentTitle)).not.toBeInTheDocument();
    expect(turnInto()).toBeDisabled();
  });

  it("a null review agent opens a picker listing agents, then POSTs the chosen agent_id", async () => {
    apiMock.post.mockResolvedValue({ id: "c2", owner_id: "a2" });
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId={null} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.click(turnInto());
    expect(screen.getByText(evalMessages.findingAction.pickAgentTitle)).toBeInTheDocument();
    const select = await screen.findByRole("combobox");
    expect(screen.getByRole("option", { name: "Security Reviewer" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "a2" } });
    fireEvent.click(screen.getByRole("button", { name: evalMessages.findingAction.pickAgentConfirm }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/findings/f1/eval-case", { agent_id: "a2" }),
    );
    expect(await screen.findByText(evalMessages.findingAction.created)).toBeInTheDocument();
  });

  it("a diff_unavailable error shows the inline reason and no created label", async () => {
    apiMock.post.mockRejectedValue(new ApiError("gone", 422, "diff_unavailable"));
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    await waitFor(() => expect(turnInto()).toBeEnabled());
    fireEvent.click(turnInto());
    expect(await screen.findByText(evalMessages.findingAction.diffUnavailable)).toBeInTheDocument();
    expect(screen.queryByText(evalMessages.findingAction.created)).not.toBeInTheDocument();
  });

  it("any other create failure shows the generic error", async () => {
    apiMock.post.mockRejectedValue(new ApiError("boom", 500, "internal"));
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    await waitFor(() => expect(turnInto()).toBeEnabled());
    fireEvent.click(turnInto());
    expect(await screen.findByText(evalMessages.findingAction.createFailed)).toBeInTheDocument();
    expect(screen.queryByText(evalMessages.findingAction.diffUnavailable)).not.toBeInTheDocument();
  });
});
