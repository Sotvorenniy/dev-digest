import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDoc } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/context.json";
import { SerializesAs } from "./SerializesAs";
import { groupForPrompt } from "./helpers";

afterEach(cleanup);

const doc = (path: string, tokens: number): ProjectContextDoc => ({
  path,
  type: path.split("/")[0]!,
  size_bytes: 10,
  tokens,
  used_by_agents: 0,
  updated_at: null,
});

const DOCS = [doc("docs/b.md", 120), doc("insights/i.md", 10), doc("specs/a.md", 50), doc("notes/n.md", 5)];

function renderBlock(attached: string[], missing: string[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <SerializesAs attached={attached} docs={DOCS} missing={missing} />
    </NextIntlClientProvider>,
  );
}

describe("groupForPrompt", () => {
  it("groups specs, docs, insights, other and keeps attach order inside a group", () => {
    const groups = groupForPrompt(["notes/n.md", "insights/i.md", "docs/b.md", "specs/a.md"], DOCS, []);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.path)])).toEqual([
      ["specs", ["specs/a.md"]],
      ["docs", ["docs/b.md"]],
      ["insights", ["insights/i.md"]],
      ["other", ["notes/n.md"]],
    ]);
  });

  it("files a missing path by its first folder and marks it missing", () => {
    const [g] = groupForPrompt(["specs/gone.md"], DOCS, ["specs/gone.md"]);
    expect(g).toEqual({ key: "specs", items: [{ path: "specs/gone.md", tokens: null, missing: true }] });
  });
});

describe("SerializesAs", () => {
  it("shows the prompt shape: heading, groups in order, one untrusted block per doc", () => {
    renderBlock(["insights/i.md", "docs/b.md", "specs/a.md"]);
    const block = screen.getByRole("region", { name: "Serializes as" });
    expect(within(block).getByText("## Project context")).toBeInTheDocument();
    const groups = [...block.querySelectorAll("[data-context-group]")].map((g) => g.getAttribute("data-context-group"));
    expect(groups).toEqual(["specs", "docs", "insights"]);
    expect(within(block).getByText("Specifications")).toBeInTheDocument();
    const item = block.querySelector('[data-context-group-item="docs/b.md"]')!;
    expect(item).toHaveTextContent('<untrusted source="docs/b.md"> ~120 tok');
  });

  it("says nothing is added when no docs are attached", () => {
    renderBlock([]);
    expect(screen.getByText("No documents attached — nothing is added to the prompt.")).toBeInTheDocument();
  });
});
