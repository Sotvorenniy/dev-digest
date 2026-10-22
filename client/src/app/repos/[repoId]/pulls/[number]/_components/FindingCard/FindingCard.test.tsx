import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
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

  it("is disabled with an aria-describedby reason while the finding is undecided", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded reviewAgentId="a1" />);
    const btn = turnInto();
    expect(btn).toBeDisabled();
    const reason = document.getElementById(btn.getAttribute("aria-describedby")!);
    expect(reason).toHaveTextContent(evalMessages.findingAction.undecidedReason);
    fireEvent.click(btn);
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  const DRAFT = {
    agent_id: "a1",
    source_finding_id: "f1",
    name: "hardcoded-stripe-secret-key src/config.ts:11",
    input_diff: "@@ -1 +1 @@\n+key",
    input_files: ["src/config.ts"],
    input_meta: { pr_number: 7, title: "Add Stripe", body: null },
    expected_output: {
      type: "must_find",
      items: [
        { file: "src/config.ts", start_line: 11, end_line: 11, title: "Hardcoded Stripe secret key", severity: "CRITICAL", category: "security" },
      ],
    },
  };
  const RESULT = {
    case_id: null,
    case_name: DRAFT.name,
    expectation_type: "must_find",
    status: "pass",
    error: null,
    kept: [{ file: "src/config.ts", start_line: 11, end_line: 11, title: "Hardcoded Stripe secret key", severity: "CRITICAL", category: "security", is_noise: false }],
    dropped: [],
    matched_items: 1,
  };
  // The own-agent path is only known once /agents has resolved; click before that opens the picker.
  const agentsLoaded = async () => {
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/agents"));
    await act(async () => {});
  };
  const postsTo = (path: string) => apiMock.post.mock.calls.filter(([p]) => p === path);

  it("click opens the modal with the prefilled draft and saves nothing", async () => {
    apiMock.post.mockResolvedValue(DRAFT);
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await agentsLoaded();
    fireEvent.click(turnInto());
    expect(await screen.findByDisplayValue(DRAFT.name)).toBeInTheDocument();
    expect(screen.getAllByRole("textbox").map((el) => (el as HTMLTextAreaElement).value)).toContain(DRAFT.input_diff);
    expect(apiMock.post).toHaveBeenCalledWith("/findings/f1/eval-case/draft", undefined);
    expect(postsTo("/findings/f1/eval-case")).toHaveLength(0);
    expect(screen.queryByText(evalMessages.findingAction.created)).not.toBeInTheDocument();
  });

  it("Cancel closes the modal without creating a case", async () => {
    apiMock.post.mockResolvedValue(DRAFT);
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await agentsLoaded();
    fireEvent.click(turnInto());
    await screen.findByDisplayValue(DRAFT.name);
    fireEvent.click(screen.getByRole("button", { name: evalMessages.caseEditor.cancel }));
    expect(screen.queryByDisplayValue(DRAFT.name)).not.toBeInTheDocument();
    expect(postsTo("/findings/f1/eval-case")).toHaveLength(0);
    expect(turnInto()).toBeEnabled();
  });

  it("Run case posts the draft to the run endpoint and shows the result without saving", async () => {
    apiMock.post.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/eval-cases/run") ? RESULT : DRAFT),
    );
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await agentsLoaded();
    fireEvent.click(turnInto());
    await screen.findByDisplayValue(DRAFT.name);
    expect(screen.getByText(evalMessages.caseEditor.notRun)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: evalMessages.caseEditor.runCase }));
    expect(await screen.findByText(evalMessages.caseEditor.runPassed)).toBeInTheDocument();
    expect(postsTo("/agents/a1/eval-cases/run")).toHaveLength(1);
    expect(postsTo("/agents/a1/eval-cases/run")[0]![1]).toMatchObject({
      name: DRAFT.name,
      input_diff: DRAFT.input_diff,
      expected_output: DRAFT.expected_output,
    });
    expect(postsTo("/findings/f1/eval-case")).toHaveLength(0);
  });

  it("invalid expected JSON disables Run case and Save", async () => {
    apiMock.post.mockResolvedValue(DRAFT);
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await agentsLoaded();
    fireEvent.click(turnInto());
    const expectedBox = (await screen.findByDisplayValue(/must_find/)) as HTMLTextAreaElement;
    fireEvent.change(expectedBox, { target: { value: "{ not json" } });
    expect(screen.getByRole("button", { name: evalMessages.caseEditor.runCase })).toBeDisabled();
    expect(screen.getByRole("button", { name: evalMessages.caseEditor.save })).toBeDisabled();
    expect(screen.getByText(evalMessages.caseEditor.invalidExpected)).toBeInTheDocument();
  });

  it("Save posts the edited fields, closes the modal and shows the created label", async () => {
    apiMock.post.mockImplementation((path: string) =>
      Promise.resolve(path === "/findings/f1/eval-case" ? { id: "c1", owner_id: "a1" } : DRAFT),
    );
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    await agentsLoaded();
    fireEvent.click(turnInto());
    const name = await screen.findByDisplayValue(DRAFT.name);
    fireEvent.change(name, { target: { value: "renamed case" } });
    fireEvent.click(screen.getByRole("button", { name: evalMessages.caseEditor.save }));
    expect(await screen.findByText(evalMessages.findingAction.created)).toBeInTheDocument();
    const [, body] = postsTo("/findings/f1/eval-case")[0]!;
    expect(body).toMatchObject({ agent_id: "a1", case: { name: "renamed case", expected_output: DRAFT.expected_output } });
    expect(screen.queryByDisplayValue("renamed case")).not.toBeInTheDocument();
    expect(turnInto()).toBeDisabled();
  });

  it("clicking while the agents list is still loading requests the draft for the review's own agent, with no picker", async () => {
    apiMock.get.mockReturnValue(new Promise(() => {}));
    apiMock.post.mockResolvedValue(DRAFT);
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId="a1" />);
    fireEvent.click(turnInto());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/findings/f1/eval-case/draft", undefined));
    expect(screen.queryByText(evalMessages.findingAction.pickAgentTitle)).not.toBeInTheDocument();
  });

  it("a null review agent opens a picker listing agents, then requests the draft for the chosen agent", async () => {
    apiMock.post.mockResolvedValue({ ...DRAFT, agent_id: "a2" });
    renderWithIntl(<FindingCard f={decided} defaultExpanded reviewAgentId={null} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    fireEvent.click(turnInto());
    expect(screen.getByText(evalMessages.findingAction.pickAgentTitle)).toBeInTheDocument();
    const select = await screen.findByRole("combobox");
    expect(screen.getByRole("option", { name: "Security Reviewer" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "a2" } });
    fireEvent.click(screen.getByRole("button", { name: evalMessages.findingAction.pickAgentConfirm }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/findings/f1/eval-case/draft", { agent_id: "a2" }),
    );
    expect(await screen.findByDisplayValue(DRAFT.name)).toBeInTheDocument();
    expect(postsTo("/findings/f1/eval-case")).toHaveLength(0);
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
