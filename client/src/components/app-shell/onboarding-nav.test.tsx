import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NAV, Sidebar, resolveHref } from "@devdigest/ui";
import shell from "../../../messages/en/shell.json";

afterEach(cleanup);

// SPEC-02 AC1. Separate from nav.test.tsx, which pins the full WORKSPACE list
// and is shared with another in-flight change.
describe("Onboarding Tour sidebar item (AC1)", () => {
  const item = NAV.find((g) => g.section === "WORKSPACE")?.items.find((i) => i.key === "onboarding-tour");

  it("exists under WORKSPACE and resolves to /repos/<repoId>/onboarding", () => {
    expect(item).toBeDefined();
    expect(resolveHref(item!.href, "r1")).toBe("/repos/r1/onboarding");
  });

  it("uses the shell:nav.onboarding-tour label", () => {
    expect(item!.label).toBe(shell.nav["onboarding-tour"]);
  });

  it("renders a link to the tour under the WORKSPACE heading for an active repo", () => {
    render(<Sidebar ctx={{ repoId: "r1" }} />);
    const workspace = screen.getByText("WORKSPACE").parentElement!;
    const link = within(workspace).getByText("Onboarding Tour").closest("a");
    expect(link).toHaveAttribute("href", "/repos/r1/onboarding");
  });
});
