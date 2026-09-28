"use client";

import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EDITOR_EXTENSIONS, EDITOR_THEME } from "./constants";
import { s } from "./styles";

/** Markdown body editor for a skill — same value/onChange shape as `Textarea`,
 *  so it drops into `FormField` the same way, but with a line-number gutter
 *  and markdown syntax highlighting a plain textarea can't give. */
export function SkillBodyEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={s.wrap}>
      <CodeMirror
        value={value}
        onChange={(v) => onChange?.(v)}
        placeholder={placeholder}
        extensions={EDITOR_EXTENSIONS}
        theme={EDITOR_THEME}
        basicSetup={{ foldGutter: false }}
        height="360px"
      />
    </div>
  );
}
