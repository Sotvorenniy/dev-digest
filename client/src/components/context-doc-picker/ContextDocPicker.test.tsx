import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDoc } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

// The inline preview panel fetches through a hook; stand it in at the hooks file.
vi.mock("@/lib/hooks/context", () => ({
  useContextDoc: (_repoId: string, path: string) => ({
    data: { path, type: "docs", size_bytes: 1, tokens: 1, used_by_agents: 0, content: "# Previewed heading" },
    isLoading: false,
    isError: false,
  }),
}));

import { ContextDocPicker } from "./ContextDocPicker";

afterEach(cleanup);

const doc = (path: string, tokens: number): ProjectContextDoc => ({
  path,
  type: path.split("/")[0]!,
  size_bytes: 10,
  tokens,
  used_by_agents: 0,
  updated_at: null,
});

const DOCS = [doc("docs/a.md", 120), doc("docs/b.md", 197), doc("specs/c.md", 50), doc("insights/d.md", 10)];

function renderPicker(over: Partial<React.ComponentProps<typeof ContextDocPicker>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocPicker
        repoId="r1"
        docs={DOCS}
        attached={[]}
        missing={[]}
        onChange={onChange}
        saving={false}
        header="ofTotal"
        {...over}
      />
    </NextIntlClientProvider>,
  );
  return { onChange, ...utils };
}

describe("ContextDocPicker", () => {
  it("each checkbox is named by its path and toggling appends in order, one onChange per click (AC7)", () => {
    const { onChange, rerender } = renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "docs/a.md" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(["docs/a.md"]);

    // parent re-renders with the saved state; second toggle sends the full ordered list
    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextDocPicker
          repoId="r1"
          docs={DOCS}
          attached={["docs/a.md"]}
          missing={[]}
          onChange={onChange}
          saving={false}
          header="ofTotal"
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "docs/b.md" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(["docs/a.md", "docs/b.md"]);
  });

  it("with 120- and 197-token docs attached the footer reads ≈ 317 tokens and the header '2 of 4 attached'", () => {
    renderPicker({ attached: ["docs/a.md", "docs/b.md"] });
    expect(screen.getByText("≈ 317 tokens per prompt")).toBeInTheDocument();
    expect(screen.getByText("2 of 4 attached")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "specs/c.md" })).not.toBeChecked();
  });

  it("unchecking removes the path and keeps the others in order", () => {
    const { onChange } = renderPicker({ attached: ["docs/b.md", "specs/c.md", "docs/a.md"] });
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/c.md" }));
    expect(onChange).toHaveBeenCalledWith(["docs/b.md", "docs/a.md"]);
  });

  it("header='count' reads '{n} attached'", () => {
    renderPicker({ attached: ["docs/a.md"], header: "count" });
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    expect(screen.queryByText(/of 4 attached/)).not.toBeInTheDocument();
  });

  it("the header and token footer are polite live regions", () => {
    renderPicker({ attached: ["docs/a.md"] });
    const header = screen.getByText("1 of 4 attached").parentElement!;
    const footer = screen.getByText("≈ 120 tokens per prompt");
    expect(header).toHaveAttribute("aria-live", "polite");
    expect(footer).toHaveAttribute("aria-live", "polite");
  });

  it("the filter narrows the rows; no match shows 'no match' and a working clear-filter button (EC2)", () => {
    renderPicker();
    const filter = screen.getByRole("textbox", { name: "Filter documents" });
    fireEvent.change(filter, { target: { value: "specs" } });
    expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual(["specs/c.md"]);

    fireEvent.change(filter, { target: { value: "zzz-nothing" } });
    expect(screen.getByText("No documents match your filter")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(filter).toHaveValue("");
  });

  it("an attached-but-missing path is a checked 'missing' row that can be unchecked (EC4)", () => {
    const { onChange } = renderPicker({ attached: ["docs/a.md", "specs/gone.md"], missing: ["specs/gone.md"] });
    const row = document.querySelector('[data-context-row="specs/gone.md"]') as HTMLElement;
    expect(row).toHaveAttribute("data-context-missing");
    expect(within(row).getByText("missing")).toBeInTheDocument();
    const box = within(row).getByRole("checkbox", { name: "specs/gone.md" });
    expect(box).toBeChecked();
    // a missing doc costs no tokens
    expect(screen.getByText("≈ 120 tokens per prompt")).toBeInTheDocument();
    // no preview for a file that does not exist
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();

    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(["docs/a.md"]);
  });

  it("each real row has a Preview button with an accessible name; clicking shows and closes the preview (NFR10)", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Preview specs/c.md" }));
    expect(screen.getByRole("heading", { name: "Previewed heading" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("heading", { name: "Previewed heading" })).not.toBeInTheDocument();
  });

  it("has no drag handle or reorder control (NG9)", () => {
    renderPicker({ attached: ["docs/a.md", "docs/b.md"] });
    expect(document.querySelector('[draggable="true"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /drag|reorder|move/i })).not.toBeInTheDocument();
  });

  it("disables the checkboxes and ignores toggles while saving, and shows the save error otherwise", () => {
    const { onChange, rerender } = renderPicker({ saving: true });
    const box = screen.getByRole("checkbox", { name: "docs/a.md" });
    expect(box).toBeDisabled();
    fireEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextDocPicker
          repoId="r1"
          docs={DOCS}
          attached={[]}
          missing={[]}
          onChange={onChange}
          saving={false}
          saveError
          header="ofTotal"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the attached documents. Try again.");
  });

  it("shows the empty state when the repo has no docs and nothing is attached", () => {
    renderPicker({ docs: [] });
    expect(screen.getByText("No context docs in this repository yet")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
