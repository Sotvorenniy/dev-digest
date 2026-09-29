import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";

// CodeMirror needs browser APIs jsdom doesn't implement — stand in a plain
// textarea with the same value/onChange shape (see client/INSIGHTS.md).
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-codemirror-mock value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const createMutateAsync = vi.fn();
vi.mock("@/lib/hooks/conventions", () => ({
  useCreateSkillFromConventions: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "ag1", name: "Security Reviewer" }, { id: "ag2", name: "Style Reviewer" }] }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  createMutateAsync.mockClear();
});

const CANDIDATES: ConventionCandidate[] = [
  {
    id: "c1",
    repo_id: "r1",
    rule: "Always use async/await over .then() chains",
    evidence_path: "src/lib/api.ts",
    evidence_snippet: "export async function apiFetch() {}",
    evidence_start_line: 21,
    evidence_end_line: 33,
    confidence: 0.82,
    status: "accepted",
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillModal", () => {
  it("prefills name, description and body from the accepted candidates", () => {
    renderWithIntl(
      <CreateSkillModal repoId="r1" repoName="acme/widgets" acceptedCandidates={CANDIDATES} onClose={vi.fn()} />,
    );
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/Merges 1 accepted candidate from acme\/widgets into one new Skill\./),
    ).toBeInTheDocument();
    const bodyField = screen.getByDisplayValue(/always-use-async-await-over-then-chains/) as HTMLTextAreaElement;
    expect(bodyField.value).toContain("export async function apiFetch");
    expect(bodyField.value).toContain("src/lib/api.ts:21-33");
  });

  it("Cancel closes the modal without calling the create mutation", () => {
    const onClose = vi.fn();
    renderWithIntl(
      <CreateSkillModal repoId="r1" repoName="acme/widgets" acceptedCandidates={CANDIDATES} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("sends no agent_id by default", async () => {
    createMutateAsync.mockResolvedValue({ id: "sk1" });
    renderWithIntl(
      <CreateSkillModal repoId="r1" repoName="acme/widgets" acceptedCandidates={CANDIDATES} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0]![0]).not.toHaveProperty("agent_id");
    expect(createMutateAsync.mock.calls[0]![0].name).toBe("repo-conventions");
  });

  it("sends agent_id when an agent is picked", async () => {
    createMutateAsync.mockResolvedValue({ id: "sk1" });
    renderWithIntl(
      <CreateSkillModal repoId="r1" repoName="acme/widgets" acceptedCandidates={CANDIDATES} onClose={vi.fn()} />,
    );
    const agentSelect = screen.getByRole("option", { name: "Security Reviewer" }).closest("select")!;
    fireEvent.change(agentSelect, { target: { value: "ag1" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0]![0].agent_id).toBe("ag1");
  });
});
