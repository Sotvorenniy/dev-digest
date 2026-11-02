export const meta = {
  name: 'instructions-eval',
  description: 'Compare agents with and without the nested package CLAUDE.md/AGENTS.md/INSIGHTS.md files; several tasks per session, blind grading',
  whenToUse: 'Called by /instructions-eval with args built from evals/instructions/<name>/eval.md',
  phases: [
    { title: 'Run', detail: 'one session per arm per run, all tasks in one prompt' },
    { title: 'Grade', detail: 'one blind grader per run, sees both arms as X and Y' },
  ],
}

// args: { name, prompt, runs, facts:[{id,task,pass_if}], arms:[{name, setup}] }  (exactly 2 arms)
const { name, prompt, facts, arms } = args ?? {}
const runs = args?.runs ?? 2
if (!name || !prompt || !Array.isArray(facts) || !facts.length || !Array.isArray(arms) || arms.length !== 2) {
  throw new Error('instructions-eval needs args: name, prompt, facts[], arms[2] (runs optional)')
}

const RULES =
  'Rules: work only inside this worktree. Do not read anything under evals/. Do not modify files outside it. ' +
  'Return the complete answer as your final text; it is graded as is.'

const runnerPrompt = (arm) =>
  `${arm.setup ? `SETUP (do this first, then never undo it, and never recover deleted files from git):\n${arm.setup}\n\n` : ''}${prompt}\n\n${RULES}`

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          X: { type: 'boolean' },
          Y: { type: 'boolean' },
          evidence: { type: 'string' },
        },
        required: ['id', 'X', 'Y', 'evidence'],
      },
    },
    false_statements_X: { type: 'array', items: { type: 'string' } },
    false_statements_Y: { type: 'array', items: { type: 'string' } },
  },
  required: ['results', 'false_statements_X', 'false_statements_Y'],
}

const graderPrompt = (x, y) =>
  `You grade two reports (X and Y) of the same six-task session against an answer key. You do not know how they were produced. ` +
  `Apply each pass_if LITERALLY to each report separately: a hedged, partial or wrong answer fails. Answer true or false per report per fact, ` +
  `with a short evidence quote. You may read repo files (read-only) to check a claim, for example that a cited INSIGHTS entry exists. ` +
  `Also list claims in each report that contradict the repo.\n\nFACTS:\n${facts.map((f) => `- ${f.id} (${f.task}): ${f.pass_if}`).join('\n')}\n\n` +
  `REPORT X:\n<<<\n${x}\n>>>\n\nREPORT Y:\n<<<\n${y}\n>>>`

const perRun = await pipeline(
  Array.from({ length: runs }, (_, i) => i),
  (i) =>
    parallel(
      arms.map((arm) => () =>
        agent(runnerPrompt(arm), { label: `${arm.name} #${i + 1}`, phase: 'Run', model: 'sonnet', isolation: 'worktree' }),
      ),
    ),
  async (reports, i) => {
    if (reports.some((r) => !r)) throw new Error(`run ${i + 1}: a runner returned nothing`)
    // X/Y assignment alternates by run index so the grader cannot learn a fixed order
    const swap = i % 2 === 1
    const [a, b] = swap ? [reports[1], reports[0]] : [reports[0], reports[1]]
    const g = await agent(graderPrompt(a, b), { label: `grade run #${i + 1}`, phase: 'Grade', model: 'sonnet', schema: GRADE_SCHEMA })
    if (!g) throw new Error(`run ${i + 1}: grader returned nothing`)
    // map X/Y back to arm names
    const xArm = swap ? arms[1].name : arms[0].name
    const yArm = swap ? arms[0].name : arms[1].name
    return {
      run: i + 1,
      results: g.results.map((r) => ({ id: r.id, [xArm]: r.X, [yArm]: r.Y, evidence: r.evidence })),
      false_statements: { [xArm]: g.false_statements_X, [yArm]: g.false_statements_Y },
    }
  },
)

const done = perRun.filter(Boolean)
const armNames = arms.map((a) => a.name)
const perFact = facts.map((f) => {
  const row = { id: f.id, task: f.task }
  for (const n of armNames) {
    const hits = done.filter((r) => r.results.find((x) => x.id === f.id)?.[n]).length
    row[n] = `${hits}/${done.length}`
    row[`${n}_hits`] = hits
  }
  return row
})
const score = (n) => perFact.reduce((s, f) => s + f[`${n}_hits`], 0) / Math.max(1, done.length * facts.length)
const result = {
  name,
  runs_requested: runs,
  runs_graded: done.length,
  score: Object.fromEntries(armNames.map((n) => [n, score(n)])),
  delta: score(armNames[0]) - score(armNames[1]),
  delta_between: `${armNames[0]} minus ${armNames[1]}`,
  per_fact: perFact.map(({ id, task, ...rest }) => ({ id, task, ...Object.fromEntries(armNames.map((n) => [n, rest[n]])) })),
  false_statements: done.flatMap((r) => armNames.flatMap((n) => (r.false_statements[n] ?? []).map((s) => `[${n} run ${r.run}] ${s}`))),
  evidence: done.map((r) => ({ run: r.run, items: r.results })),
}
log(`score ${armNames.map((n) => `${n} ${result.score[n].toFixed(2)}`).join(' | ')} | delta ${result.delta.toFixed(2)}`)
return result
