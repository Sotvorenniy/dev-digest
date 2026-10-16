import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const action = vi.fn();
let smartData: SmartDiff | undefined;
let reviewData: ReviewRecord[] = [];
let smartPending = false;

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => ({ data: reviewData }),
  useSmartDiff: () => ({ data: smartData, isPending: smartPending }),
  useFindingAction: () => ({ isPending: false, variables: undefined, mutate: action }),
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  action.mockClear();
  smartPending = false;
});

const PATCH = "@@ -10,3 +10,4 @@\n a\n b\n+secret\n c";
const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: PATCH }) as PrFile;
const FILES = [file("README.md"), file("src/config.ts"), file("pnpm-lock.yaml"), file("src/a.test.ts")];

const sf = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [sf("src/config.ts")] },
    { role: "tests", files: [sf("src/a.test.ts")] },
    { role: "docs", files: [sf("README.md")] },
    { role: "boilerplate", files: [sf("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

const FINDING = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "bad",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
} as FindingRecord;

const fnd = (over: Partial<FindingRecord>): FindingRecord => ({ ...FINDING, ...over }) as FindingRecord;
const review = (findings: FindingRecord[]) =>
  [{ id: "r1", pr_id: "p", agent_id: "a1", findings } as unknown as ReviewRecord];

function setup(withFindings = true, findings: FindingRecord[] = [FINDING], smart: SmartDiff | null = SMART) {
  smartData = smart ?? undefined;
  reviewData = withFindings ? review(findings) : [];
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="p" filesCount={4} files={FILES} canComment={false} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab", () => {
  it("renders role groups in smart order", () => {
    const { container } = setup();
    const roles = [...container.querySelectorAll("[data-role-group]")].map((e) => e.getAttribute("data-role-group"));
    expect(roles).toEqual(["core", "tests", "docs", "boilerplate"]);
  });

  it("collapses docs and boilerplate, opens core/tests", () => {
    const { container } = setup();
    const expanded = (role: string) =>
      container.querySelector(`[data-role-group="${role}"] button[aria-expanded]`)!.getAttribute("aria-expanded");
    expect(expanded("core")).toBe("true");
    expect(expanded("tests")).toBe("true");
    expect(expanded("docs")).toBe("false");
    expect(expanded("boilerplate")).toBe("false");
  });

  it("group count is files, findings count is separate", () => {
    const { container } = setup();
    const core = container.querySelector('[data-role-group="core"]') as HTMLElement;
    expect(within(core).getByText("1 files")).toBeInTheDocument();
    expect(core.querySelector("[data-group-findings-count]")!.textContent).toBe("1");
  });

  it("group header counts files with findings, not findings (2 files, 5 findings -> 2)", () => {
    const smart: SmartDiff = {
      ...SMART,
      groups: [{ role: "core", files: [sf("src/config.ts"), sf("src/other.ts"), sf("src/clean.ts")] }],
    };
    const files = [file("src/config.ts"), file("src/other.ts"), file("src/clean.ts")];
    smartData = smart;
    reviewData = review([
      fnd({ id: "a1", file: "src/config.ts" }),
      fnd({ id: "a2", file: "src/config.ts" }),
      fnd({ id: "a3", file: "src/config.ts" }),
      fnd({ id: "b1", file: "src/other.ts" }),
      fnd({ id: "b2", file: "src/other.ts" }),
    ]);
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p" filesCount={3} files={files} canComment={false} />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector("[data-group-findings-count]")!.textContent).toBe("2");
  });

  it("labels WARNING as warning and SUGGESTION as suggestion", () => {
    const { container } = setup(true, [
      fnd({ id: "w", severity: "WARNING", start_line: 11 }),
      fnd({ id: "s", severity: "SUGGESTION", start_line: 12 }),
    ]);
    expect(container.querySelector("[data-finding-line-label='warning']")).not.toBeNull();
    expect(container.querySelector("[data-finding-line-label='suggestion']")).not.toBeNull();
  });

  it("renders findings that match no diff line (unanchored)", () => {
    const { container } = setup(true, [fnd({ id: "u1", start_line: 999, title: "Floating issue" })]);
    expect(container.querySelector("[data-finding-id='u1']")).not.toBeNull();
    expect(screen.getByText("Floating issue")).toBeInTheDocument();
    expect(container.querySelector("[data-finding-line-label]")).toBeNull();
  });

  it("mutes accepted and dismissed findings with a status tag", () => {
    const { container } = setup(true, [
      fnd({ id: "acc", start_line: 11, accepted_at: "2026-01-01T00:00:00Z" as FindingRecord["accepted_at"] }),
      fnd({ id: "dis", start_line: 12, dismissed_at: "2026-01-01T00:00:00Z" as FindingRecord["dismissed_at"] }),
    ]);
    const acc = container.querySelector("[data-finding-id='acc']") as HTMLElement;
    const dis = container.querySelector("[data-finding-id='dis']") as HTMLElement;
    expect(within(acc).getByText("accepted")).toBeInTheDocument();
    expect(within(dis).getByText("dismissed")).toBeInTheDocument();
    expect(acc.style.opacity).toBe("0.6");
    expect(dis.style.opacity).toBe("0.6");
  });

  it("falls back to the flat file list while smart-diff is loading or failed", () => {
    const { container } = setup(true, [FINDING], null);
    expect(container.querySelector("[data-role-group]")).toBeNull();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(container.querySelector("[data-finding-id='f1']")).not.toBeNull();
  });

  it("shows the file dot, the line label and the inline card", () => {
    const { container } = setup();
    expect(container.querySelector("[data-file-finding-dot]")).not.toBeNull();
    expect(container.querySelector("[data-finding-line-label='blocker']")).not.toBeNull();
    expect(container.querySelector("[data-finding-id='f1']")).not.toBeNull();
  });

  it("Accept calls the finding action", () => {
    setup();
    fireEvent.click(screen.getByText("Accept"));
    expect(action).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "p" });
  });

  it("Original order drops the groups but keeps every file", () => {
    const { container } = setup();
    fireEvent.click(container.querySelector("[data-diff-order='original']")!);
    expect(container.querySelector("[data-role-group]")).toBeNull();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(container.querySelector("[data-diff-order='original']")!.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("DiffTab — Review focus (?file / ?line)", () => {
  const scroll = vi.fn();
  const original = Element.prototype.scrollIntoView;
  beforeEach(() => {
    scroll.mockReset();
    Element.prototype.scrollIntoView = scroll;
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = original;
  });

  const tree = (focusFile?: string | null, focusLine?: string | null) => (
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="p" filesCount={4} files={FILES} canComment={false} focusFile={focusFile} focusLine={focusLine} />
    </NextIntlClientProvider>
  );
  const renderFocus = (focusFile?: string | null, focusLine?: string | null) => {
    smartData = SMART;
    reviewData = [];
    return render(tree(focusFile, focusLine));
  };
  const scrolledEl = (i = 0) => scroll.mock.contexts[i] as HTMLElement;

  it("AC8: the focus line carries data-focus-line and is the element scrolled into view", () => {
    const { container } = renderFocus("src/config.ts", "12");
    const line = container.querySelector("[data-focus-line]") as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.textContent).toContain("secret");
    expect(container.querySelector("[data-focus-file]")).toContainElement(line);
    expect(scroll).toHaveBeenCalledTimes(1);
    // the scrolled node is the line row (its wrapper), not the file header
    expect(scrolledEl()).toContainElement(line);
    expect(scrolledEl().textContent).toContain("secret");
  });

  it("AC8: a collapsed group (docs) is opened for a focused file inside it", () => {
    const { container } = renderFocus("README.md", "12");
    const docs = container.querySelector('[data-role-group="docs"]') as HTMLElement;
    expect(docs.querySelector("button[aria-expanded]")!.getAttribute("aria-expanded")).toBe("true");
    expect(docs.querySelector("[data-focus-line]")).not.toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("a line that is not rendered scrolls the file header instead", () => {
    const { container } = renderFocus("src/config.ts", "999");
    expect(container.querySelector("[data-focus-line]")).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scrolledEl().textContent).toContain("src/config.ts");
    expect(scrolledEl().querySelector("[data-focus-line]")).toBeNull();
  });

  it("EC18: a file that is not in the PR is not highlighted or scrolled, and a notice says so", () => {
    const { container } = renderFocus("ghost.ts", "12");
    expect(scroll).not.toHaveBeenCalled();
    expect(container.querySelector("[data-focus-file]")).toBeNull();
    expect(container.querySelector("[data-focus-line]")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff: ghost.ts");
  });

  it("a focused file that is in the PR shows no not-in-diff notice", () => {
    const { container } = renderFocus("src/config.ts", "12");
    expect(container.querySelector("[data-focus-not-in-diff]")).toBeNull();
  });

  it("NFR8: line=abc keeps the file focus and falls back to the header", () => {
    const { container } = renderFocus("src/config.ts", "abc");
    expect(container.querySelector("[data-focus-file]")).not.toBeNull();
    expect(container.querySelector("[data-focus-line]")).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("with no focus nothing is scrolled or marked, and the usual collapse rules hold", () => {
    const { container } = renderFocus();
    expect(scroll).not.toHaveBeenCalled();
    expect(container.querySelector("[data-focus-file]")).toBeNull();
    expect(
      container.querySelector('[data-role-group="docs"] button[aria-expanded]')!.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("F6: re-rendering with the same props does not scroll again; a new line does", () => {
    const { rerender } = renderFocus("src/config.ts", "12");
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(tree("src/config.ts", "12"));
    rerender(tree("src/config.ts", "12"));
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(tree("src/config.ts", "13"));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scrolledEl(1).textContent).toContain("c");
  });

  it("F6: while Smart Diff is loading nothing scrolls; when it arrives there is exactly one scroll", () => {
    smartData = undefined;
    smartPending = true;
    reviewData = [];
    const { rerender, container } = render(tree("src/config.ts", "12"));
    expect(scroll).not.toHaveBeenCalled();
    expect(container.querySelector("[data-role-group]")).toBeNull();
    smartData = SMART;
    smartPending = false;
    rerender(tree("src/config.ts", "12"));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scrolledEl()).toContainElement(container.querySelector("[data-focus-line]") as HTMLElement);
    rerender(tree("src/config.ts", "12"));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("F7: the same (file, line) remounting from the flat list into groups still scrolls once", () => {
    smartData = undefined;
    smartPending = false; // settled without data -> flat list
    reviewData = [];
    const { rerender } = render(tree("src/config.ts", "12"));
    expect(scroll).toHaveBeenCalledTimes(1);
    smartData = SMART;
    rerender(tree("src/config.ts", "12"));
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
