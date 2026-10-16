import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDoc, ProjectContextFile, ProjectContextList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";
import { ApiError } from "@/lib/api";

// AppShell needs the full app chrome + providers; stub it (client INSIGHTS).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

interface ListResult {
  data: ProjectContextList | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  error?: unknown;
  refetch: () => void;
}
interface DocResult {
  data?: ProjectContextFile;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
}

let listResult: ListResult;
interface ReindexResult {
  mutate: () => void;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
}
let reindexResult: ReindexResult = { mutate: vi.fn(), isPending: false, isError: false };
let docResult: DocResult = { isLoading: false, isError: false };
const requestedDocs: (string | null | undefined)[] = [];

vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => listResult,
  useReindexContext: () => reindexResult,
  useContextDoc: (_repoId: string, path: string | null) => {
    requestedDocs.push(path);
    return path ? docResult : { isLoading: false, isError: false };
  },
}));

import { ContextView } from "./ContextView";

afterEach(() => {
  cleanup();
  requestedDocs.length = 0;
  docResult = { isLoading: false, isError: false };
  reindexResult = { mutate: vi.fn(), isPending: false, isError: false };
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

const doc = (path: string, over: Partial<ProjectContextDoc> = {}): ProjectContextDoc => ({
  path,
  type: path.split("/")[0]!,
  size_bytes: 100,
  tokens: 10,
  used_by_agents: 0,
  updated_at: null,
  ...over,
});

const LIST: ProjectContextList = {
  docs: [
    doc("docs/b.md", { tokens: 120, used_by_agents: 3 }),
    doc("insights/c.md", { tokens: 80 }),
    doc("specs/a.md", { tokens: 197 }),
  ],
  total_tokens: 397,
  search_roots: ["**/{specs,docs,insights}/**/*.md"],
  truncated: false,
};

function ok(data: ProjectContextList): ListResult {
  return { data, isLoading: false, isError: false, refetch: vi.fn() };
}

describe("ContextView", () => {
  it("renders one row per doc and the files/tokens footer, with no 'chunks' wording (AC2)", () => {
    listResult = ok(LIST);
    renderView();
    const rows = document.querySelectorAll("[data-context-doc]");
    expect([...rows].map((r) => r.getAttribute("data-context-doc"))).toEqual([
      "docs/b.md",
      "insights/c.md",
      "specs/a.md",
    ]);
    expect(screen.getByText("3 files · 397 tokens total")).toBeInTheDocument();
    expect(screen.getByText("~197 tok")).toBeInTheDocument();
    expect(screen.queryByText(/chunks/i)).not.toBeInTheDocument();
  });

  it("selecting a doc renders its markdown headings, 'Used by 3 agents', and no edit controls (AC3, AC4)", () => {
    listResult = ok(LIST);
    docResult = {
      isLoading: false,
      isError: false,
      data: {
        ...LIST.docs[0]!,
        content: "# Doc B title\n\n## Second heading\n\nBody text.",
      },
    };
    renderView();
    expect(screen.getByText("Select a document to preview it")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /docs\/b\.md/ }));

    expect(screen.getByRole("heading", { level: 1, name: "Doc B title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Second heading" })).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(requestedDocs).toContain("docs/b.md");
    // read-only: no textbox, no edit/new/upload/save controls
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    for (const name of [/edit/i, /new/i, /upload/i, /save/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("the toolbar has Download and Reindex; Reindex calls the reindex mutation", () => {
    listResult = ok(LIST);
    renderView();
    const toolbar = screen.getByRole("toolbar", { name: "Project context actions" });
    expect(within(toolbar).getAllByRole("button").map((b) => b.textContent)).toEqual(["Download", "Reindex"]);
    fireEvent.click(within(toolbar).getByRole("button", { name: "Reindex" }));
    expect(reindexResult.mutate).toHaveBeenCalledTimes(1);
  });

  it("Download is disabled until a doc is loaded, then saves it as a .md file", () => {
    listResult = ok(LIST);
    docResult = {
      isLoading: false,
      isError: false,
      data: { ...LIST.docs[2]!, content: "# Spec A" },
    };
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderView();
    const download = screen.getByRole("button", { name: "Download" });
    expect(download).toBeDisabled();

    fireEvent.click(document.querySelector('[data-context-doc="specs/a.md"]')!);
    expect(download).toBeEnabled();
    fireEvent.click(download);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("a.md");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
    click.mockRestore();
  });

  it("a failed reindex on a missing clone shows its own message with Retry", () => {
    listResult = ok(LIST);
    reindexResult = {
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      error: new ApiError("repository clone could not be synced", 409, "clone_unavailable"),
    };
    renderView();
    const alert = document.querySelector("[data-context-reindex-error]") as HTMLElement;
    expect(alert).toHaveTextContent("Couldn’t pull the latest changes");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(reindexResult.mutate).toHaveBeenCalledTimes(1);
  });

  it("empty state names the search roots (EC1)", () => {
    listResult = ok({ ...LIST, docs: [], total_tokens: 0 });
    renderView();
    expect(screen.getByText("No context docs found")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add Markdown docs under **/{specs,docs,insights}/**/*.md in the repository, then reindex. Agents and skills can attach them as grounding context.",
      ),
    ).toBeInTheDocument();
  });

  it("409 shows the clone-unavailable error with a working Retry (EC3)", () => {
    const refetch = vi.fn();
    listResult = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("conflict", 409, "clone_unavailable"),
      refetch,
    };
    renderView();
    expect(
      screen.getByText("The repository clone isn’t available yet. Refresh the repository and try again."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the truncated banner (EC9)", () => {
    listResult = ok({ ...LIST, truncated: true });
    renderView();
    expect(
      screen.getByText("Too many files — the list is truncated. Only the first files found are shown."),
    ).toBeInTheDocument();
  });

  it("does not show the truncated banner for a complete list", () => {
    listResult = ok(LIST);
    renderView();
    expect(document.querySelector("[data-context-truncated]")).toBeNull();
  });

  it("a failed refetch (429) keeps the last list and offers Retry (EC21)", () => {
    listResult = {
      data: LIST,
      isLoading: false,
      isError: true,
      error: new ApiError("slow down", 429),
      refetch: vi.fn(),
    };
    renderView();
    expect(document.querySelectorAll("[data-context-doc]")).toHaveLength(3);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Couldn’t load project context")).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(listResult.refetch).toHaveBeenCalled();
  });

  it("a 413 preview shows the too-large message instead of content (NFR2)", () => {
    listResult = ok(LIST);
    docResult = { isLoading: false, isError: true, error: new ApiError("too big", 413) };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /specs\/a\.md/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("This file is too large to preview.");
  });

  it("a 400 preview shows the generic preview error (EC18)", () => {
    listResult = ok(LIST);
    docResult = { isLoading: false, isError: true, error: new ApiError("bad", 400, "context_path_invalid") };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /specs\/a\.md/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t preview this file.");
  });

  it("renders hostile markdown inertly: no script, no onerror, no javascript: href (NFR8)", () => {
    listResult = ok(LIST);
    docResult = {
      isLoading: false,
      isError: false,
      data: {
        ...LIST.docs[0]!,
        content: [
          "# Title",
          "<script>window.__pwned = 1</script>",
          '<img src="x" onerror="window.__pwned = 2">',
          "[click me](javascript:window.__pwned=3)",
          "<a href=\"javascript:window.__pwned=4\">raw anchor</a>",
        ].join("\n\n"),
      },
    };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /docs\/b\.md/ }));

    const preview = document.querySelector("[data-context-preview]")!;
    expect(within(preview as HTMLElement).getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(preview.querySelector("script")).toBeNull();
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.querySelector("[onerror]")).toBeNull();
    // the link text still renders; only the dangerous href is dropped
    expect(within(preview as HTMLElement).getByText("click me")).toBeInTheDocument();
    for (const a of preview.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^\s*javascript:/i);
    }
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
