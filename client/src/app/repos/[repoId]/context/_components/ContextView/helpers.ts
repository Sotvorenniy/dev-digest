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
