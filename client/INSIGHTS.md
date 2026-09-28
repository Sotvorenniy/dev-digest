# Insights — client

Non-obvious findings and gotchas. Add an entry whenever something surprised you,
so the next agent/session doesn't relearn it.

Entries are append-only: enrich or correct an existing one, never delete it.
Format — an H3 stating the claim, a dated body, and `path:line` evidence.
`/engineering-insights` maintains this file; see `.claude/skills/engineering-insights/`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — never skip it. -->

### An absolutely-positioned popover in the PR table is clipped to ~8px
`2026-09-26` — `s.tableCard` sets `overflow: hidden` to clip rows to its
rounded corners, so a `position: absolute` panel inside a row is cut off at the
card edge — only the popover header showed. Unit tests pass regardless; jsdom
has no layout. Any hover panel hanging off a PR row must be portaled to
<body> with `position: fixed` and coordinates from the trigger's
`getBoundingClientRect()`, re-measured on scroll/resize. Portaling then breaks
DOM containment, so `onMouseLeave` fires when the cursor crosses the gap into
the panel — a ~120ms close delay, cleared by the panel's own `onMouseEnter`,
is required or a scrollable panel can never be reached.
Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts:90`,
`client/src/components/findings-popover/`

### Formatting a cost at fixed 4dp reports cheap real runs as free
`2026-09-25` — `formatCost` floored at `toFixed(4)`, so a run costing $0.000034
rendered "$0.00" — identical to a genuinely free run, and ~22 OpenRouter models
really are priced $0/$0, so both states occur side by side. Cheap models make
this routine: `mistralai/mistral-nemo` on a 3 400-token review costs $0.000069.
Values under $0.0001 now render "<$0.0001", keeping "$0.00" for actually free.
Any new money formatting here needs the same three-way split: unknown "—", free
"$0.00", too-small "<$0.0001".
Evidence: `client/src/components/run-cost-badge/helpers.ts:1-40`

## Codebase Patterns
<!-- Component folders, theming, data flow, providers — with the reason. -->

## Tool & Library Notes
<!-- Quirks of Next 15, React 19, TanStack Query, next-intl, the bundler. -->

### The "pnpm is broken" problem is a corepack shim/package mismatch, not missing network access
`2026-09-28` — `AGENTS.md` documents `pnpm <script>` failing with `Cannot find
matching keyid` and prescribes `./node_modules/.bin/<bin>` as the workaround —
which unblocks running existing scripts but not *adding* a new dependency
(`pnpm add` needs `pnpm` itself, and `npm install` here is explicitly
off-limits: the pnpm lockfile is authoritative, not `package-lock.json`).
Root cause, found while adding `jszip`/`diff`/`@uiw/react-codemirror`: the
corepack-managed pnpm@12.6.0 in `~/.cache/node/corepack/v1/pnpm/12.6.0/` ships
only `bin/pnpm.mjs`, but the installed `corepack` shim looks for
`bin/pnpm.cjs` — a version-mismatch, not a network or registry problem (`npm
view pnpm version` resolves fine). Fix: install a standalone pnpm via npm,
bypassing corepack entirely — `npm install -g pnpm@10 --prefix
/tmp/pnpm-global` (or anywhere writable), then use
`/tmp/pnpm-global/bin/pnpm` in place of `pnpm` for real work: `pnpm install
--frozen-lockfile` and `pnpm add <pkg>` both succeed against the existing
`lockfileVersion: '9.0'` pnpm-lock.yaml in both `server/` and `client/`, no
lockfile format hiccups. This is a per-environment/session workaround (nothing
in the repo changes), so it needs to be redone wherever `pnpm add`/`pnpm
install` is genuinely needed — `./node_modules/.bin/<bin>` remains correct for
running an already-installed script.
Evidence: `~/.cache/node/corepack/v1/pnpm/12.6.0/bin/` (has `pnpm.mjs`, not
`pnpm.cjs`), `client/pnpm-lock.yaml:1` (same fix applies verbatim in
`server/`, see `server/INSIGHTS.md`)

### `MonoLink` with no `href` renders a <button>, not a link
`2026-09-26` — The name reads as a link, but without `href` it returns a
`<button>`; only the `href` branch renders an `<a>`. That makes it unusable on
a read-only surface with a "no buttons" requirement (the findings hover
popover), and it adds a tab stop wherever it appears. Use a plain
`<span className="mono">` styled to match when the `file:line` must not be
interactive.
Evidence: `client/src/vendor/ui/primitives/MonoLink.tsx:44`

### `diff`'s `createTwoFilesPatch` output must be stripped before DiffViewer's `parsePatch` sees it
`2026-09-28` — `DiffViewer`/`parsePatch` was built for GitHub-shaped patches
and classifies ANY line starting with `+` or `-` as an added/removed content
line — it has no concept of a `---`/`+++` file-header line. `diff` npm
package's `createTwoFilesPatch(oldLabel, newLabel, oldBody, newBody)` always
emits `Index:`/`===`/`--- oldLabel`/`+++ newLabel` header lines before the
first `@@` hunk, so feeding its output straight to `DiffViewer` corrupts the
first two real diff lines as a false add/del pair. Fix: slice the returned
string from its first `"\n@@"` onward (`full.slice(full.indexOf("\n@@") + 1)`)
before building the `PrFile`-shaped object `DiffViewer` expects. Needed
whenever a client-computed (non-GitHub) diff is rendered through this
component, e.g. a saved-version-vs-current comparison.
Evidence: `client/src/components/diff-viewer/helpers.ts:18` (`HUNK_HEADER_RE`
match, no header handling), `client/src/app/skills/[id]/_components/SkillEditor/_components/VersionsTab/helpers.ts:23`

### `@uiw/react-codemirror` throws under jsdom — mock it in component tests
`2026-09-28` — CodeMirror 6 calls browser layout APIs jsdom doesn't implement
(`Range.prototype.getClientRects` and friends), so any RTL test that mounts a
real `<CodeMirror>` instance is unreliable/can throw. Mock the module instead
of the wrapper component so the wrapper's own logic (value/onChange wiring)
still gets exercised: `vi.mock("@uiw/react-codemirror", () => ({ default: (p)
=> <textarea value={p.value} onChange={(e) => p.onChange?.(e.target.value)}
/> }))`.
Evidence: `client/src/components/skill-body-editor/SkillBodyEditor/SkillBodyEditor.tsx`,
`client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.test.tsx`

## Recurring Errors & Fixes
<!-- Errors seen more than once, each with the fix that worked. -->

## Session Notes
<!-- Dated summaries. Two lines each — this is not a chat replay. -->

## Open Questions
<!-- Left unresolved, for whoever picks it up next. -->

### No client hook exposes "which agents use this skill" (skill → agent reverse lookup)
`2026-09-28` — `useAgentSkills(agentId)` (`client/src/lib/hooks/agents.ts:94`)
only goes agent → skills; there's no `/skills/:id/agents`-shaped endpoint or
hook for the reverse direction. The `SkillsRail` row spec asked for an
optional "N agents" count per skill, but without a real endpoint the only way
to compute it client-side would be calling `useAgentSkills` once per agent and
tallying — an N+1 fetch pattern, not built. Left out of
`client/src/app/skills/_components/SkillsRail/SkillsRail.tsx` for this reason;
add a proper reverse-lookup endpoint before wiring this up.
Evidence: `client/src/lib/hooks/agents.ts:94-100`, `client/src/lib/hooks/skills.ts`
