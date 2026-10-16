import React from "react";
import { OpenLink } from "../OpenLink";
import { TruncatedPath } from "../TruncatedPath";
import { s } from "../../styles";

export interface FileEntry {
  path: string;
  /** Short explanation shown under the path (why / reason). */
  note?: string | null;
  /** Small trailing text, e.g. a score. */
  meta?: string | null;
}

/** Shared list of file paths with an optional note, trailing meta and an Open link. */
export function FileEntryList({
  entries,
  repoFullName,
  sha,
}: {
  entries: FileEntry[];
  repoFullName: string;
  sha: string;
}) {
  return (
    <ul style={s.list}>
      {entries.map((e) => (
        <li key={e.path} style={s.entry} data-onboarding-entry>
          <div style={s.entryMain}>
            <div style={s.entryPathRow}>
              <TruncatedPath path={e.path} />
              {e.meta && <span style={s.score}>{e.meta}</span>}
            </div>
            {e.note && <div style={s.entryNote}>{e.note}</div>}
          </div>
          <OpenLink repoFullName={repoFullName} sha={sha} path={e.path} />
        </li>
      ))}
    </ul>
  );
}
