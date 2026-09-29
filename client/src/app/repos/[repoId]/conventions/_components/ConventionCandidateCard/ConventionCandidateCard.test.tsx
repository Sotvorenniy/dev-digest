import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const setStatusMutate = vi.fn();
const editMutate = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  useSetConventionCandidateStatus: () => ({ mutate: setStatusMutate, isPending: false, variables: undefined }),
  useEditConventionCandidate: () => ({ mutate: editMutate, isPending: false }),
}));

import { ConventionCandidateCard } from "./ConventionCandidateCard";

afterEach(() => {
  cleanup();
  setStatusMutate.mockClear();
  editMutate.mockClear();
});

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  rule: "Always use async/await over .then() chains",
  evidence_path: "src/lib/api.ts",
  evidence_snippet: "export async function apiFetch() { /* ... */ }",
  evidence_start_line: 21,
  evidence_end_line: 33,
  confidence: 0.82,
  status: "pending",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCandidateCard", () => {
  it("renders the rule, confidence and file:line evidence location", () => {
    renderWithIntl(<ConventionCandidateCard repoId="r1" candidate={CANDIDATE} />);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("src/lib/api.ts:21-33")).toBeInTheDocument();
  });

  it("clicking Accept calls the status mutation with 'accepted'", () => {
    renderWithIntl(<ConventionCandidateCard repoId="r1" candidate={CANDIDATE} />);
    fireEvent.click(screen.getByText("Accept as Skill"));
    expect(setStatusMutate).toHaveBeenCalledWith({ id: "c1", status: "accepted" });
  });

  it("clicking Reject calls the status mutation with 'rejected'", () => {
    renderWithIntl(<ConventionCandidateCard repoId="r1" candidate={CANDIDATE} />);
    fireEvent.click(screen.getByText("Reject"));
    expect(setStatusMutate).toHaveBeenCalledWith({ id: "c1", status: "rejected" });
  });

  it("shows 'Accepted' (pressed) once the candidate is accepted", () => {
    renderWithIntl(<ConventionCandidateCard repoId="r1" candidate={{ ...CANDIDATE, status: "accepted" }} />);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("Edit toggles inline fields; Save calls the edit mutation and nothing navigates", () => {
    renderWithIntl(<ConventionCandidateCard repoId="r1" candidate={CANDIDATE} />);

    // Not editing yet — no inline inputs, just plain text.
    expect(screen.queryByDisplayValue(CANDIDATE.rule)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Edit"));
    const ruleInput = screen.getByDisplayValue(CANDIDATE.rule);
    fireEvent.change(ruleInput, { target: { value: "Updated rule text" } });
    fireEvent.click(screen.getByText("Save"));

    expect(editMutate).toHaveBeenCalledWith(
      { id: "c1", rule: "Updated rule text", evidence_snippet: CANDIDATE.evidence_snippet },
      expect.anything(),
    );
  });

  it("Edit → Cancel reverts the draft without calling the edit mutation", () => {
    renderWithIntl(<ConventionCandidateCard repoId="r1" candidate={CANDIDATE} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    const ruleInput = screen.getByDisplayValue(CANDIDATE.rule);
    fireEvent.change(ruleInput, { target: { value: "Scratch text" } });
    fireEvent.click(screen.getByText("Cancel"));

    expect(editMutate).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});
