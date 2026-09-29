import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NAV, Sidebar } from "@devdigest/ui";

afterEach(cleanup);

const keysOf = (section: string) => NAV.find((g) => g.section === section)?.items.map((i) => i.key);

describe("sidebar grouping", () => {
  it("puts Agents, Skills and Conventions in SKILLS LAB, not in WORKSPACE", () => {
    expect(keysOf("WORKSPACE")).toEqual(["pulls"]);
    expect(keysOf("SKILLS LAB")).toEqual(["agents", "skills", "conventions"]);
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
});
