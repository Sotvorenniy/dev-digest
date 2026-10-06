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

### A `<AppShell>`-wrapped page view needs `@/components/app-shell` mocked, not its hooks
`2026-09-28` — Any page-level `_components/<Name>View` that renders
`<AppShell crumb={...}>` (the standard shell wrapper, e.g.
`client/src/app/repos/[repoId]/pulls/page.tsx`'s pattern) pulls in
`useShellContext`, which itself calls `usePulls`/`useDeleteRepo` (React
Query), `useActiveRepo` (repo-context), `useTheme`, and
`next/navigation`'s `usePathname`/`useRouter`, plus needs the `"shell"` i18n
namespace loaded — too much to stand up for a focused RTL test of the view's
own loading/error/empty logic. Mocking just the hooks it happens to call is
fragile (`useShellContext` may add more). Mock the whole module instead:
`vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }) =>
<div>{children}</div> }))` — same isolation idea as mocking a hooks file, one
level up.
Evidence: `client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.test.tsx:9-13`,
`client/src/components/app-shell/hooks/useShellContext.ts:22-29`

### IntentCard's confidence thresholds are hand-mirrored from the server
`2026-10-04` — `HIGH_CONFIDENCE = 0.75` / `MEDIUM_CONFIDENCE = 0.5` in the
card's `constants.ts` copy the server's `intent/domain.ts` rule; the wire
carries only the numeric `confidence`, so a server-side change silently
mislabels the badge. Change both together.
Evidence: `server/src/modules/intent/domain.ts:12`

### Nested `_components/` drift: IntentCard owns styles/constants/helpers
`2026-10-04` — The frontend-ui-architecture skill says nested `_components/`
children have no own `styles.ts`/`constants.ts`/`helpers.ts` and a named-only
`index.ts`, but `IntentCard` (under `OverviewTab/_components/`) and existing
folders such as SkillsTab and SettingsApiKeys do own them, with the
named-and-default `index.ts` from AGENTS.md. Follow the repo's actual pattern
until the skill is reconciled; the skill was deliberately not edited.
Evidence: `.claude/skills/frontend-ui-architecture/SKILL.md:42`

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

### A repo-name slugifier silently truncates text with a "/" in it
`2026-09-28` — Wrote one `slugify()` helper meant to turn a repo `full_name`
("acme/widgets") into "widgets" by taking the last "/"-segment before
lowercasing/dashing. Reused the same function for slugifying a convention
*rule's text* into a markdown heading — but rule text can itself contain a
literal "/" (e.g. "Always use async/await over .then() chains"), so the
basename-style split silently dropped everything before it, producing
"await-over-then-chains" instead of the full heading. Caught only because a
component test asserted on the exact generated string
(`toMatch(/always-use-async-await-over-then-chains/)`); a looser
`toBeInTheDocument()` check on the body textarea would have missed it. Fix:
split the "org/repo → repo" basename logic into its own function and give the
generic text→slug transform no path-splitting step at all.
Evidence: `client/src/app/repos/[repoId]/conventions/_components/CreateSkillModal/helpers.ts:1-33`

### The `Icon`/`IconName` registry's "Edit" is not "Pencil"
`2026-09-28` — `icons.tsx` maps the prototype's `Edit` name to lucide's
`Pencil` component (`Edit: Pencil` inside the `Icon` object literal) but does
**not** also export a top-level `Pencil` key, so `IconName` (derived via
`keyof typeof Icon`) has `"Edit"`, not `"Pencil"`. Passing `icon="Pencil"` to
`IconBtn`/`Button` fails `tsc` with TS2322 ("not assignable to ... 63 more
..."), not a runtime error — easy to miss by eyeballing since lucide-react
itself does export a real `Pencil`. Always pass `icon="Edit"` for a
pencil/edit affordance.
Evidence: `client/src/vendor/ui/icons.tsx:64,147,167`

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

### Update: skill → agent count is now served by the API (`Skill.agent_count`)
`2026-09-28` — Resolves the open question above: `GET /skills` returns
`agent_count`, so `SkillCard` shows "N agents" with no per-agent fan-out.
`ImportSkillDrawer` moved to `src/components/import-skill-drawer/` because both
`/skills` and the agent Skills tab use it (a route may not import another
route's `_components`).
Evidence: `client/src/app/skills/_components/SkillsGridView/_components/SkillCard/SkillCard.tsx`
