import React from "react";
import { s } from "../../styles";

/** A repo path with CSS ellipsis; the full path is the text content, the tooltip and the focus target. */
export function TruncatedPath({ path }: { path: string }) {
  return (
    <span style={s.path} title={path} tabIndex={0} data-onboarding-path>
      {path}
    </span>
  );
}
