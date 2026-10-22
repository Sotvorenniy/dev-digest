export const meta = {
  name: 'skill-eval',
  description: 'Run a skill eval: N runs with the skill and N without, grade each against the answer key, report the delta',
  whenToUse: 'Called by /skill-eval with args built from <skill>/evals/eval.md and expected-findings.json',
  phases: [
    { title: 'Run', detail: 'with-skill and baseline agents, same prompt' },
    { title: 'Grade', detail: 'one grader per report, sees the answer key' },
  ],
}

// args: { skill, prompt, runs, facts:[{id,pass_if}], rubric:[string], thresholds:{recall,structure} }
const { skill, prompt, facts, rubric } = args ?? {}
const runs = args?.runs ?? 3
const thresholds = args?.thresholds ?? {}
if (!skill || !prompt || !Array.isArray(facts) || !facts.length || !Array.isArray(rubric)) {
  throw new Error('skill-eval needs args: skill, prompt, facts[], rubric[] (runs, thresholds optional)')
}

const SIDES = ['with-skill', 'baseline']
const items = SIDES.flatMap((side) => Array.from({ length: runs }, (_, i) => ({ side, n: i + 1 })))

const COMMON = 'Read-only: do not edit files, do not run install, update or remove.'
const runnerPrompt = ({ side, n }) =>
  side === 'with-skill'
    ? `${prompt}\n\nRules: use the Skill tool to invoke \`${skill}\` and follow it. ${COMMON} ` +
      `Do not read anything under evals/. ` +
      `Write any output files only under .devdigest/cache/skill-evals/${skill}/run-${n}/. Return the final report as your answer.`
    : `${prompt}\n\nRules: do NOT call the Skill tool. Do not read anything under .claude/skills/${skill}/ ` +
      `(scripts included), anything under evals/, or any cache folder that skill writes. ${COMMON} Return the final report as your answer.`

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, found: { type: 'boolean' }, evidence: { type: 'string' } },
        required: ['id', 'found', 'evidence'],
      },
    },
    false_statements: { type: 'array', items: { type: 'string' } },
    structure: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'number' }, awarded: { type: 'boolean' } },
        required: ['n', 'awarded'],
      },
    },
  },
  required: ['facts', 'false_statements', 'structure'],
}

const graderPrompt = (report) =>
  `You grade one report against an answer key. Apply each pass_if LITERALLY: a hedged, partial or wrong statement fails. ` +
  `A fact is found only if the report states it and names the package or dependency.\n\n` +
  `FACTS:\n${facts.map((f) => `- ${f.id}: ${f.pass_if}`).join('\n')}\n\n` +
  `STRUCTURE RUBRIC (award a point only if the report clearly has it):\n${rubric.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` +
  `FALSE STATEMENTS: list each claim in the report that contradicts the repo. You may read repo files (read-only) to check a claim; skip claims you cannot check.\n\n` +
  `REPORT:\n<<<\n${report}\n>>>`

const graded = await pipeline(
  items,
  (it) => agent(runnerPrompt(it), { label: `${it.side} #${it.n}`, phase: 'Run', model: 'sonnet' }),
  (report, it) => {
    if (!report) throw new Error('runner returned nothing')
    return agent(graderPrompt(report), { label: `grade ${it.side} #${it.n}`, phase: 'Grade', model: 'sonnet', schema: GRADE_SCHEMA })
      .then((g) => (g ? { ...it, ...g, report } : null))
  },
)

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const summarise = (side) => {
  const rs = graded.filter(Boolean).filter((r) => r.side === side)
  const lost = runs - rs.length
  const perFact = facts.map((f) => {
    const hits = rs.filter((r) => r.facts.find((x) => x.id === f.id)?.found).length
    return { id: f.id, found_in: `${hits}/${rs.length}`, majority: hits * 2 > rs.length }
  })
  const perRunRecall = rs.map((r) => r.facts.filter((x) => facts.some((f) => f.id === x.id) && x.found).length / facts.length)
  const perRunStructure = rs.map((r) => r.structure.filter((s) => s.awarded).length)
  return {
    side,
    runs_graded: rs.length,
    runs_lost: lost,
    recall_majority: perFact.filter((f) => f.majority).length / facts.length,
    recall_per_run: perRunRecall,
    structure_mean: mean(perRunStructure),
    structure_per_run: perRunStructure,
    false_statements: rs.flatMap((r) => r.false_statements.map((s) => `[${side} #${r.n}] ${s}`)),
    per_fact: perFact,
  }
}

const withSkill = summarise('with-skill')
const baseline = summarise('baseline')
const verdict = {
  recall_ok: thresholds.recall == null || withSkill.recall_majority >= thresholds.recall,
  structure_ok: thresholds.structure == null || withSkill.structure_mean >= thresholds.structure,
}
log(`with-skill recall ${withSkill.recall_majority.toFixed(2)} structure ${withSkill.structure_mean.toFixed(1)} | baseline recall ${baseline.recall_majority.toFixed(2)} structure ${baseline.structure_mean.toFixed(1)}`)
log('Tokens and wall time are not available inside a workflow script; read them from the run summary.')

return {
  skill,
  runs_per_side: runs,
  thresholds,
  verdict: { ...verdict, pass: verdict.recall_ok && verdict.structure_ok },
  delta: {
    recall: withSkill.recall_majority - baseline.recall_majority,
    structure: withSkill.structure_mean - baseline.structure_mean,
  },
  with_skill: withSkill,
  baseline,
}
