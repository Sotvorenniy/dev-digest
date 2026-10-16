import { ApiError } from "@/lib/api";

/** i18n key (under `context`) for a failed doc preview. 413 gets its own text;
 *  400 (invalid path / not UTF-8) and anything else share the generic one. */
export function previewErrorKey(error: unknown): "previewTooLarge" | "previewError" {
  return error instanceof ApiError && error.status === 413 ? "previewTooLarge" : "previewError";
}

/** The API answers 409 `clone_unavailable` when the repo has no usable clone. */
export function isCloneUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** Saves `content` as a `.md` file named after the doc's last path segment. */
export function downloadMarkdown(path: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "document.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
