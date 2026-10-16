/** Prompt group order by doc type. Hand-mirrored from the server's
 *  `CONTEXT_GROUP_ORDER` (server/src/modules/project-context/domain.ts) —
 *  change both together. Any other type goes last, as "other". */
export const PROMPT_GROUP_ORDER = ["specs", "docs", "insights"] as const;
