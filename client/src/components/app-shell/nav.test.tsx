import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NAV, Sidebar } from "@devdigest/ui";
import shell from "../../../messages/en/shell.json";

afterEach(cleanup);

const keysOf = (section: string) => NAV.find((g) => g.section === section)?.items.map((i) => i.key);

describe("sidebar grouping", () => {
  it("puts Agents, Skills and Conventions in SKILLS LAB, not in WORKSPACE", () => {
    expect(keysOf("WORKSPACE")).toEqual(["pulls", "context", "onboarding-tour"]);
    expect(keysOf("SKILLS LAB")).toEqual(["agents", "skills", "conventions", "eval"]);
  });

  it("renders Eval Dashboard under SKILLS LAB, marked current on /eval (SPEC-07 AC1)", () => {
    render(<Sidebar ctx={{ activeKey: "eval" }} />);
    const lab = screen.getByText("SKILLS LAB").parentElement!;
    const label = within(lab).getByText(shell.nav.eval);
    expect(label.closest("a")).toHaveAttribute("href", "/eval");
    expect(label.closest("[aria-current]")).toHaveAttribute("aria-current", "page");
  });

  it("renders the Agents link under the SKILLS LAB heading", () => {
    render(<Sidebar ctx={{}} />);
    const lab = screen.getByText("SKILLS LAB").parentElement!;
    expect(within(lab).getByText("Agents")).toBeInTheDocument();
    expect(within(lab).getByText("Skills")).toBeInTheDocument();
    expect(within(lab).getByText("Conventions")).toBeInTheDocument();
    const workspace = screen.getByText("WORKSPACE").parentElement!;
    expect(within(workspace).queryByText("Agents")).not.toBeInTheDocument();
    expect(within(workspace).queryByText("Skills")).not.toBeInTheDocument();
  });

  it("puts only Agent Performance in GLOBAL (SPEC-04 AC1)", () => {
    expect(keysOf("GLOBAL")).toEqual(["agent-performance"]);
    const item = NAV.find((g) => g.section === "GLOBAL")!.items[0]!;
    expect(item.href).toBe("/agent-performance");
    expect(item.label).toBe(shell.nav["agent-performance"]);
  });

  it("renders the Agent Performance link under the GLOBAL heading, and no other GLOBAL entry", () => {
    render(<Sidebar ctx={{ activeKey: "agent-performance" }} />);
    const global = screen.getByText("GLOBAL").parentElement!;
    expect(within(global).getByText("Agent Performance").closest("a")).toHaveAttribute("href", "/agent-performance");
    for (const label of [shell.nav.memory, shell.nav["multi-agent"], shell.nav["ci-runs"]]) {
      expect(within(global).queryByText(label)).not.toBeInTheDocument();
    }
  });
});
