import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const setSkillsMutate = vi.fn();
const updateSkillMutate = vi.fn();
let skills: Skill[] = [];
let links: { skill_id: string; order: number }[] = [];
vi.mock("@/lib/hooks", () => ({
  useSkills: () => ({ data: skills }),
  useAgentSkills: () => ({ data: links }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateSkillMutate, isPending: false }),
}));
vi.mock("@/components/import-skill-drawer", () => ({
  ImportSkillDrawer: ({ onImported, onClose }: { onImported?: (s: Skill) => void; onClose: () => void }) => (
    <button
      data-import-drawer
      onClick={() => {
        onImported?.(mk("new"));
        onClose();
      }}
    >
      finish import
    </button>
  ),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1" } as Agent;
const mk = (id: string, enabled = true): Skill => ({
  id,
  name: `skill-${id}`,
  description: "",
  type: id === "b" ? "security" : "custom",
  source: "manual",
  body: "",
  enabled,
  version: 1,
  agent_count: 0,
});
const row = (id: string) => document.querySelector(`[data-skill-row][data-skill-id="${id}"]`) as HTMLElement;

beforeEach(() => {
  // a, b, c attached (c disabled); d unattached
  skills = [mk("a"), mk("b"), mk("c", false), mk("d")];
  links = [
    { skill_id: "a", order: 0 },
    { skill_id: "b", order: 1 },
    { skill_id: "c", order: 2 },
  ];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );

describe("SkillsTab list", () => {
  it("lists ALL skills, each with a drag handle, an attach toggle and a type badge — no checkbox", () => {
    renderTab();
    for (const id of ["a", "b", "c", "d"]) {
      const r = within(row(id));
      expect(r.queryByRole("checkbox")).toBeNull();
      expect(r.getByRole("switch")).toBeInTheDocument();
    }
    expect(within(row("b")).getByText("security")).toBeInTheDocument();
    expect(within(row("a")).getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(within(row("d")).getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(within(row("a")).getByText("#1")).toBeInTheDocument();
    expect(within(row("d")).queryByText(/^#\d/)).toBeNull();
  });

  it("the toggle attaches/detaches the skill", () => {
    renderTab();
    fireEvent.click(within(row("d")).getByRole("switch"));
    expect(setSkillsMutate).toHaveBeenCalledWith(["a", "b", "c", "d"]);
    fireEvent.click(within(row("a")).getByRole("switch"));
    expect(setSkillsMutate).toHaveBeenCalledWith(["b", "c"]);
  });

  it("keeps the name filter", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "skill-b" } });
    expect(row("b")).not.toBeNull();
    expect(row("a")).toBeNull();
  });
});

describe("SkillsTab drag and drop", () => {
  it("only attached rows are draggable", () => {
    renderTab();
    expect(row("a")).toHaveAttribute("draggable", "true");
    expect(row("c")).toHaveAttribute("draggable", "true");
    expect(row("d")).toHaveAttribute("draggable", "false"); // unattached
  });

  it("dropping an attached row on another persists the new order", () => {
    renderTab();
    fireEvent.dragStart(row("a"));
    fireEvent.dragOver(row("b"));
    fireEvent.drop(row("b"));
    expect(setSkillsMutate).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("ignores a drop onto an unattached row, and a drag started from one", () => {
    renderTab();
    fireEvent.dragStart(row("a"));
    fireEvent.drop(row("d"));
    expect(setSkillsMutate).not.toHaveBeenCalled();
    fireEvent.dragStart(row("d"));
    fireEvent.drop(row("a"));
    expect(setSkillsMutate).not.toHaveBeenCalled();
  });
});

describe("SkillsTab import", () => {
  it("attaches the newly imported skill by appending it to the ordered set", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Import skill" }));
    fireEvent.click(document.querySelector("[data-import-drawer]") as HTMLElement);
    expect(setSkillsMutate).toHaveBeenCalledWith(["a", "b", "c", "new"]);
  });
});
