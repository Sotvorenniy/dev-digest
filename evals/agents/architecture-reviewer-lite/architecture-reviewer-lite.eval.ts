import { describeAgent, runAgentCases } from "../../src/index.js";
// Deliberately reuses the strict variant's cases — same fixture, same practices, same
// threshold. Only the injected agent artifact differs (architecture-reviewer-lite has the
// "cite the specific documented rule per finding" hard rule removed). That is what makes this
// pair a controlled A/B rather than two unrelated evals: pnpm eval:repeat both with labels and
// pnpm eval:delta them to see exactly which practice moved.
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

// Same cases, but the lite variant drops the rule-citation hard rule on purpose, so on the
// reviewer-core discriminator it scores 0.5-0.83 across runs. Its own floor is 0.5; the strict
// agent keeps 0.8. The strict-vs-lite gap is the signal this pair exists to measure.
const liteCases = cases.map((c) => (c.name.startsWith("cites the DevDigest-specific") ? { ...c, threshold: 0.5 } : c));

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", liteCases));
