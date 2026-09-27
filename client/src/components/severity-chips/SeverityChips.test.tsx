import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeverityChips, countBySeverity } from ".";

afterEach(cleanup);

describe("countBySeverity", () => {
  it("tallies by severity and ignores nothing else", () => {
    expect(
      countBySeverity([
        { severity: "CRITICAL" },
        { severity: "CRITICAL" },
        { severity: "WARNING" },
      ]),
    ).toEqual({ CRITICAL: 2, WARNING: 1 });
  });

  it("returns an empty tally for an empty list", () => {
    expect(countBySeverity([])).toEqual({});
  });
});

describe("SeverityChips", () => {
  it("renders one chip per non-zero severity, worst first", () => {
    const { container } = render(
      <SeverityChips counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 4 }} />,
    );
    expect(container.textContent).toBe("24");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("falls back to an em dash when there is nothing to show", () => {
    render(<SeverityChips counts={{}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
