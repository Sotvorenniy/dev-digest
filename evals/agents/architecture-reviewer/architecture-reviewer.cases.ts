import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The fixtures are standalone diffs: the files they touch are NOT on disk in this repo. Without
// this line cheap models try to Read them, find nothing and stop to ask for paths.
const DIFF_ONLY = `The diff below is the COMPLETE change set. The files it touches are not on disk, so do not try to read them: review the diff text itself, and read only the repo docs/skills you need for the rules. Never ask me for paths or more input; always finish with the report.`;

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${DIFF_ONLY}

${fx("checkout-service.diff")}`;

// A second real diff whose violations (reviewer-core I/O, skipped groundFindings gate) a
// competent model will describe in prose but will not spontaneously tie to a documented rule
// unless the agent forces a citation. This is the discriminating case for the strict-vs-lite A/B:
// both variants should FIND both problems, but only the strict variant (which keeps the "cite the
// rule it breaks" hard rule) should reliably name the rule. No rule IDs are demanded: the rules
// live in skills/AGENTS.md as prose, not as identifiers.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${DIFF_ONLY}

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${DIFF_ONLY}

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether "cites the specific documented rule" keeps passing.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a violation of the inward-only dependency rule between Domain and Presentation layers",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of DI discipline (concrete adapters/repositories must be constructed only in the composition root / container)",
      "every finding names the documented rule it breaks as a skill + section or an `AGENTS.md` line (e.g. `onion-architecture/SKILL.md` checklist, `layers.md` \"Services: dependencies in, not looked up\"), rather than describing the problem only in prose",
      "assigns a severity (critical/high/medium/low/info) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit verdict that is not a plain PASS (`PASS WITH FINDINGS` or `BLOCKED`), because HIGH findings exist",
    ],
    threshold: 0.8, // lite drops the rule-citation practice by design: 5/6 must pass
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "any finding about the optional `reply?: FastifyReply` parameter is classified as a layering / inward-dependency violation (the same issue as the `fastify` import), and no security or runtime bug is presented as an architecture finding",
      "reports no finding whose primary subject is naming, style, or missing tests (testability named only inside a failure scenario of a layering/DI finding is fine)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule identifier for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "the fs-import finding names a documented rule (skill + section or `AGENTS.md` line, e.g. reviewer-core purity / no I/O) rather than only describing it in prose",
      "the skipped-gate finding names a documented rule (skill + section or `AGENTS.md` line, e.g. ground findings before emitting) rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit verdict that is not a plain PASS (`PASS WITH FINDINGS` or `BLOCKED`), because HIGH findings exist",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only `info`-level, non-blocking observations) — it does not invent a critical/high/medium finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the final verdict is PASS (not BLOCKED)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
