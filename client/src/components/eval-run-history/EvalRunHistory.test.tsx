import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSetRun, EvalSetRunDetail } from "@devdigest/shared";
import evalMessages from "../../../messages/en/eval.json";

// Boundary mock: the run-detail data hook. Table, checkboxes, dialog and focus trap are real.
let details: Record<string, Partial<EvalSetRunDetail>> = {};
const updateMutate = vi.fn();
const updateReset = vi.fn();
let updateState: { isPending: boolean; isSuccess: boolean; isError: boolean } = { isPending: false, isSuccess: false, isError: false };
vi.mock("@/lib/hooks", () => ({
  useUpdateAgent: () => ({ mutate: updateMutate, reset: updateReset, ...updateState }),
  useEvalRun: (id: string | null | undefined) => ({
    data: id && details[id] ? { results: [], system_prompt: "", ...details[id] } : undefined,
    isError: false,
  }),
}));

import { EvalRunHistory } from "./EvalRunHistory";

const mkRun = (id: string, over: Partial<EvalSetRun> = {}): EvalSetRun => ({
  id,
  agent_id: "a",
  agent_version: 1,
  model: "m/x",
  strategy: "auto",
  status: "done",
  started_at: "2026-10-01T10:00:00Z",
  finished_at: "2026-10-01T10:01:00Z",
  cases_total: 2,
  cases_passed: 1,
  cases_errored: 0,
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 0.5,
  cost_usd: 0.01,
  duration_ms: 1,
  ...over,
});

afterEach(() => {
  cleanup();
  details = {};
  updateMutate.mockClear();
  updateReset.mockClear();
  updateState = { isPending: false, isSuccess: false, isError: false };
});

const when = (iso: string) => new Date(iso).toLocaleString("en");
const label = (version: number, iso: string) => `Select run v${version} from ${when(iso)}`;
const renderHistory = (runs: EvalSetRun[], agentName = "Security Reviewer") =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalRunHistory runs={runs} agentName={agentName} />
    </NextIntlClientProvider>,
  );
const compareBtn = () => screen.getByRole("button", { name: evalMessages.compare.compareButton });

const OLD = mkRun("old", { agent_version: 1, started_at: "2026-10-01T10:00:00Z", recall: 0.5, precision: 0.4, citation_accuracy: 0.9, cost_usd: 0.01 });
const NEW = mkRun("new", { agent_version: 2, started_at: "2026-10-02T10:00:00Z", recall: 0.8, precision: null, citation_accuracy: 0.9, cost_usd: 0.0125 });

function openCompare(runs: EvalSetRun[]) {
  renderHistory(runs);
  fireEvent.click(screen.getByRole("checkbox", { name: label(2, NEW.started_at) }));
  fireEvent.click(screen.getByRole("checkbox", { name: label(1, OLD.started_at) }));
  const btn = compareBtn();
  btn.focus();
  fireEvent.click(btn);
  return btn;
}

describe("EvalRunHistory selection", () => {
  it("labels each finished run's checkbox with version and time", () => {
    renderHistory([NEW, OLD]);
    expect(screen.getByRole("checkbox", { name: label(2, NEW.started_at) })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: label(1, OLD.started_at) })).toBeInTheDocument();
  });

  it("Compare is disabled unless exactly two runs are checked", () => {
    renderHistory([NEW, OLD, mkRun("mid", { agent_version: 3, started_at: "2026-10-03T10:00:00Z" })]);
    expect(compareBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: label(2, NEW.started_at) }));
    expect(compareBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: label(1, OLD.started_at) }));
    expect(compareBtn()).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: label(1, OLD.started_at) }));
    expect(compareBtn()).toBeDisabled();
  });

  it("a third pick drops the oldest pick so at most two stay checked", () => {
    const third = mkRun("third", { agent_version: 3, started_at: "2026-10-03T10:00:00Z" });
    renderHistory([third, NEW, OLD]);
    fireEvent.click(screen.getByRole("checkbox", { name: label(1, OLD.started_at) }));
    fireEvent.click(screen.getByRole("checkbox", { name: label(2, NEW.started_at) }));
    fireEvent.click(screen.getByRole("checkbox", { name: label(3, third.started_at) }));
    const checked = screen.getAllByRole("checkbox").filter((c) => c.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: label(1, OLD.started_at) })).toHaveAttribute("aria-checked", "false");
    expect(compareBtn()).toBeEnabled();
  });

  it("running and failed runs have no checkbox", () => {
    renderHistory([mkRun("r", { status: "running" }), mkRun("f", { status: "failed" }), OLD]);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("shows at most 20 rows, newest first", () => {
    const many = Array.from({ length: 25 }, (_, i) => mkRun(`r${i}`, { agent_version: 100 - i }));
    renderHistory(many);
    expect(document.querySelectorAll("[data-eval-run-row]")).toHaveLength(20);
    expect(screen.getByText("v100")).toBeInTheDocument();
    expect(screen.queryByText("v75")).not.toBeInTheDocument();
  });

  it("shows the empty text with no runs, and the full agent name as a title", () => {
    renderHistory([], "A very long agent name that would otherwise be clipped");
    expect(screen.getByText(evalMessages.compare.noRuns)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: evalMessages.compare.history })).toHaveAttribute(
      "title",
      "A very long agent name that would otherwise be clipped",
    );
  });

  it("row cells carry a title with the full version and time", () => {
    renderHistory([OLD]);
    expect(screen.getByText("v1")).toHaveAttribute("title", "v1");
    expect(screen.getByText(when(OLD.finished_at!))).toHaveAttribute("title", when(OLD.finished_at!));
  });
});

describe("CompareRunsDialog (opened from the history)", () => {
  it("shows old -> new for recall, precision, citation and cost, ordered by time whatever the pick order", () => {
    details = { old: { system_prompt: "same" }, new: { system_prompt: "same" } };
    openCompare([NEW, OLD]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("v1 → v2")).toBeInTheDocument();
    // recall 50% -> 80% (+30 pt)
    expect(within(dialog).getByText("50%")).toBeInTheDocument();
    expect(within(dialog).getByText("80% (+30 pt)")).toBeInTheDocument();
    // precision 40% -> null: dash with dash delta
    expect(within(dialog).getByText("40%")).toBeInTheDocument();
    expect(within(dialog).getByText("— (—)")).toBeInTheDocument();
    // citation unchanged
    expect(within(dialog).getByText("90% (±0 pt)")).toBeInTheDocument();
    // cost three-way format: both known -> signed delta
    expect(within(dialog).getByText("$0.01")).toBeInTheDocument();
    expect(within(dialog).getByText("$0.0125 (+$0.0025)")).toBeInTheDocument();
  });

  it("formats unknown cost as a dash and tiny cost as <$0.0001, without a cost delta", () => {
    const o = { ...OLD, cost_usd: null };
    const n = { ...NEW, cost_usd: 0.00003 };
    details = { old: {}, new: {} };
    openCompare([n, o]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("<$0.0001")).toBeInTheDocument();
    expect(within(dialog).getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).queryByText(/<\$0\.0001 \(/)).not.toBeInTheDocument();
  });

  it("lists added and removed prompt lines as text, never HTML", () => {
    details = {
      old: { system_prompt: "keep\nremove me\ntail" },
      new: { system_prompt: "keep\n<b>added</b>\ntail" },
    };
    openCompare([NEW, OLD]);
    const added = document.querySelector('[data-prompt-line="added"]') as HTMLElement;
    const removed = document.querySelector('[data-prompt-line="removed"]') as HTMLElement;
    expect(added).toHaveTextContent("<b>added</b>");
    expect(added).toHaveAttribute("title", "<b>added</b>");
    expect(added.querySelector("b")).toBeNull();
    expect(removed).toHaveTextContent("remove me");
    expect(document.querySelectorAll("[data-prompt-line]")).toHaveLength(2);
    expect(screen.queryByText(evalMessages.compare.promptsIdentical)).not.toBeInTheDocument();
  });

  it("Promote asks for confirmation, then saves the newer run's prompt on the agent", () => {
    details = { old: { system_prompt: "old prompt" }, new: { system_prompt: "new prompt" } };
    openCompare([NEW, OLD]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.compare.promote.replace("{version}", "v2") }));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(within(dialog).getByText(evalMessages.compare.promoteConfirm.replace("{version}", "v2"))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: evalMessages.compare.promoteConfirmButton })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.compare.promoteConfirmButton }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "a", patch: { system_prompt: "new prompt" } });
  });

  it("Cancel in the confirmation saves nothing and brings the Promote button back", () => {
    details = { old: { system_prompt: "old prompt" }, new: { system_prompt: "new prompt" } };
    openCompare([NEW, OLD]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.compare.promote.replace("{version}", "v2") }));
    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.compare.promoteCancel }));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: evalMessages.compare.promote.replace("{version}", "v2") })).toBeInTheDocument();
  });

  it("a failed promote shows the error; after Cancel the next Promote asks again without the old error", () => {
    details = { old: { system_prompt: "old prompt" }, new: { system_prompt: "new prompt" } };
    updateState = { isPending: false, isSuccess: false, isError: true };
    openCompare([NEW, OLD]);
    const dialog = screen.getByRole("dialog");
    const promoteName = evalMessages.compare.promote.replace("{version}", "v2");
    fireEvent.click(within(dialog).getByRole("button", { name: promoteName }));
    expect(updateReset).toHaveBeenCalled();
    updateReset.mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.compare.promoteCancel }));
    expect(updateReset).toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: promoteName })).toHaveFocus();
  });

  it("while promoting, Cancel and the confirm button are disabled and the label says Promoting", () => {
    details = { old: { system_prompt: "old prompt" }, new: { system_prompt: "new prompt" } };
    updateState = { isPending: true, isSuccess: false, isError: false };
    openCompare([NEW, OLD]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.compare.promote.replace("{version}", "v2") }));
    expect(within(dialog).getByRole("button", { name: evalMessages.compare.promoting })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: evalMessages.compare.promoteCancel })).toBeDisabled();
  });

  it("offers no Promote when the prompts are identical", () => {
    details = { old: { system_prompt: "x" }, new: { system_prompt: "x" } };
    openCompare([NEW, OLD]);
    expect(screen.queryByRole("button", { name: /Promote/ })).not.toBeInTheDocument();
  });

  it("shows the confirmation of a finished promote", () => {
    details = { old: { system_prompt: "old" }, new: { system_prompt: "new" } };
    updateState = { isPending: false, isSuccess: true, isError: false };
    openCompare([NEW, OLD]);
    expect(screen.getByText(evalMessages.compare.promoteDone)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promote/ })).not.toBeInTheDocument();
  });

  it("says the prompts are identical when they match", () => {
    details = { old: { system_prompt: "x" }, new: { system_prompt: "x" } };
    openCompare([NEW, OLD]);
    expect(screen.getByText(evalMessages.compare.promptsIdentical)).toBeInTheDocument();
    expect(document.querySelector("[data-prompt-line]")).toBeNull();
  });

  it("notes when the two runs used different models, and not otherwise", () => {
    details = { old: {}, new: {} };
    openCompare([{ ...NEW, model: "m/new" }, { ...OLD, model: "m/old" }]);
    expect(screen.getByText("Models differ: m/old → m/new")).toBeInTheDocument();
    cleanup();
    openCompare([NEW, OLD]);
    expect(screen.queryByText(/Models differ/)).not.toBeInTheDocument();
  });

  it("moves focus into the dialog and returns it to Compare on close", () => {
    details = { old: {}, new: {} };
    const btn = openCompare([NEW, OLD]);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(btn).not.toHaveFocus();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });

  it("closes on Escape and returns focus to Compare", () => {
    details = { old: {}, new: {} };
    const btn = openCompare([NEW, OLD]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });
});
