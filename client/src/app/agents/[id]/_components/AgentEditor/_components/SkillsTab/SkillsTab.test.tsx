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
  it("lists ALL skills, each with an attach checkbox, a type badge and an enabled toggle", () => {
    renderTab();
    for (const id of ["a", "b", "c", "d"]) {
      const r = within(row(id));
      expect(r.getByRole("checkbox")).toBeInTheDocument();
      expect(r.getByRole("switch")).toBeInTheDocument();
    }
    expect(within(row("b")).getByText("security")).toBeInTheDocument();
    expect(within(row("a")).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    expect(within(row("d")).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });

  it("the enabled toggle updates the skill and does not touch attachment or order", () => {
    renderTab();
    fireEvent.click(within(row("d")).getByRole("switch"));
    expect(updateSkillMutate).toHaveBeenCalledWith({ id: "d", patch: { enabled: false } });
    expect(setSkillsMutate).not.toHaveBeenCalled();
    const ids = [...document.querySelectorAll("[data-skill-row]")].map((n) => n.getAttribute("data-skill-id"));
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the name filter", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "skill-b" } });
    expect(row("b")).not.toBeNull();
    expect(row("a")).toBeNull();
  });
});

describe("SkillsTab drag and drop", () => {
  it("only attached + enabled rows are draggable", () => {
    renderTab();
    expect(row("a")).toHaveAttribute("draggable", "true");
    expect(row("b")).toHaveAttribute("draggable", "true");
    expect(row("c")).toHaveAttribute("draggable", "false"); // attached but disabled
    expect(row("d")).toHaveAttribute("draggable", "false"); // enabled but unattached
  });

  it("dropping an enabled attached row on another persists the new order", () => {
    renderTab();
    fireEvent.dragStart(row("a"));
    fireEvent.dragOver(row("b"));
    fireEvent.drop(row("b"));
    expect(setSkillsMutate).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("ignores a drop onto a disabled row, and a drag started from a disabled row", () => {
    renderTab();
    fireEvent.dragStart(row("a"));
    fireEvent.drop(row("c"));
    expect(setSkillsMutate).not.toHaveBeenCalled();
    fireEvent.dragStart(row("c"));
    fireEvent.drop(row("a"));
    expect(setSkillsMutate).not.toHaveBeenCalled();
  });

  it("keyboard arrows still reorder, and are hidden on a disabled row", () => {
    renderTab();
    fireEvent.click(within(row("b")).getByRole("button", { name: "Move up" }));
    expect(setSkillsMutate).toHaveBeenCalledWith(["b", "a", "c"]);
    expect(within(row("c")).queryByRole("button", { name: "Move up" })).toBeNull();
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
