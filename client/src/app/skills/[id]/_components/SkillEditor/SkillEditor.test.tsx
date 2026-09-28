import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

// CodeMirror needs browser APIs jsdom doesn't implement (Range.getClientRects
// etc.) — stand in a plain textarea with the same value/onChange shape.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-codemirror-mock value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

// Mock the underlying hooks file (not the "@/lib/hooks" barrel) so every tab
// module in SkillEditor's static import tree resolves, even the ones this
// test never renders — same approach as AgentEditor.test.tsx.
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality",
  type: "rubric",
  source: "manual",
  body: "# Rule\nBe thorough.",
  enabled: true,
  version: 2,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillEditor Config tab (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
  });

  it("shows the unsaved badge only once the draft diverges from the saved skill", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.queryByText("Unsaved")).not.toBeInTheDocument();
  });
});

describe("SkillEditor Preview tab (smoke)", () => {
  it("renders the saved body, not a draft", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={() => {}} />);
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByText("Be thorough.")).toBeInTheDocument();
  });
});
