import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";

/** CodeMirror extensions: markdown syntax + line-wrapping (bodies are prose). */
export const EDITOR_EXTENSIONS: Extension[] = [markdown(), EditorView.lineWrapping];

/** Chrome colors pulled from this app's CSS variables, not a canned theme —
 *  keeps the editor in sync with light/dark instead of fighting it. */
export const EDITOR_THEME = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--bg-surface)",
      color: "var(--text-primary)",
      fontSize: "13px",
      border: "1px solid var(--border-strong)",
      borderRadius: "7px",
    },
    "&.cm-focused": {
      outline: "none",
      borderColor: "var(--accent)",
    },
    ".cm-content": {
      caretColor: "var(--text-primary)",
      fontFamily: "var(--font-mono)",
      padding: "10px 0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--bg-surface)",
      color: "var(--text-muted)",
      border: "none",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine": { backgroundColor: "var(--bg-hover)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--bg-hover)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "var(--accent-bg)",
    },
    ".cm-cursor": { borderLeftColor: "var(--text-primary)" },
  },
  { dark: true },
);
