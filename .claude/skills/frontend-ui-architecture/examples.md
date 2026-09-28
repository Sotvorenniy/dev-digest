# Examples

BAD/GOOD pairs for the rules in [SKILL.md](SKILL.md). Each one shows a placement or boundary
decision, not a rendering concern.

## Contents

- [Colocation vs premature sharing](#colocation-vs-premature-sharing)
- [The `utils/` junk drawer](#the-utils-junk-drawer)
- [Cross-feature imports](#cross-feature-imports)
- [Business rules buried in JSX](#business-rules-buried-in-jsx)
- [Server data copied into state](#server-data-copied-into-state)
- [A hook that should be a function](#a-hook-that-should-be-a-function)
- [Splitting markup when the problem is logic](#splitting-markup-when-the-problem-is-logic)
- [Prop soup vs composition](#prop-soup-vs-composition)
- [Chained barrels](#chained-barrels)
- [`'use client'` placed too high](#use-client-placed-too-high)
- [Client shell wrapping server content](#client-shell-wrapping-server-content)
- [Magic numbers](#magic-numbers)
- [Fetching from a component](#fetching-from-a-component)

---

## Colocation vs premature sharing

A helper used by exactly one component, parked in a global folder.

```ts
// BAD — src/utils/formatters.ts, imported by one component three folders away
export function formatSeverityLabel(finding: Finding) { … }
export function formatRunDuration(run: Run) { … }
export function formatRepoSlug(repo: Repo) { … }
```

```ts
// GOOD — src/components/finding-card/helpers.ts
/** Label shown on the severity pill. Lives here because only FindingCard renders one. */
export function formatSeverityLabel(finding: Finding) { … }
```

Move it up when a second, unrelated consumer appears — not before. Narrowing a shared helper
later is much harder than widening a colocated one.

## The `utils/` junk drawer

```ts
// BAD — src/utils/index.ts, 400 lines, no theme
export const slugify = …
export const parseGithubUrl = …
export const modelLabel = …
export const clamp = …
export const latestReviewFor = …
```

```ts
// GOOD — named modules; the import line says what it brings in
// src/lib/github-urls.ts     → parseGithubUrl, pullRequestUrl
// src/lib/model-label.ts     → modelLabel
// src/lib/latest-reviews.ts  → latestReviewFor
```

A folder whose name describes nothing attracts everything.

## Cross-feature imports

```ts
// BAD — features/reviews reaching into features/agents
import { AgentAvatar } from "@/features/agents/components/AgentAvatar";
```

Two features are now one. Deleting `agents/` breaks `reviews/`.

```tsx
// GOOD — either promote the shared piece…
import { Avatar } from "@/components/avatar";   // domain-free, shared layer

// …or compose at the app level, where both features are already visible
<ReviewPanel review={review} renderAuthor={() => <AgentAvatar id={review.agentId} />} />
```

## Business rules buried in JSX

```tsx
// BAD — the rule exists only inside markup, untestable and unreusable
{finding.severity === "critical" ||
 (finding.severity === "high" && finding.confidence > 0.8) ? (
  <BlockingBanner />
) : null}
```

```ts
// GOOD — domain module, no React import, tested by calling it
/** A finding blocks merge when it is critical, or high with strong confidence. */
export function isBlocking(finding: Finding) {
  return finding.severity === "critical" ||
    (finding.severity === "high" && finding.confidence > HIGH_CONFIDENCE);
}
```

```tsx
{isBlocking(finding) && <BlockingBanner />}
```

## Server data copied into state

```tsx
// BAD — two sources of truth that drift the moment the query refetches
const { data } = useFindings(prId);
const [findings, setFindings] = useState<Finding[]>([]);
useEffect(() => { if (data) setFindings(data); }, [data]);
```

```tsx
// GOOD — the cache owns the data; derive what you need during render
const { data: findings = [] } = useFindings(prId);
const blocking = findings.filter(isBlocking);
```

## A hook that should be a function

```ts
// BAD — no state, no context, no effect. The `use` prefix is decoration.
export function useSeverityLabel(finding: Finding) {
  return finding.severity.toUpperCase();
}
```

```ts
// GOOD — a plain function, callable from anywhere including tests and the server
export function severityLabel(finding: Finding) {
  return finding.severity.toUpperCase();
}
```

Reach for a hook when the logic owns state, subscribes to something external, or reads context.

## Splitting markup when the problem is logic

```tsx
// BAD — the JSX was never the problem; now the logic is split across two files too
function FindingsTable({ findings }) {
  const [sort, setSort] = useState("severity");
  const [filter, setFilter] = useState<Severity | null>(null);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => { /* 30 lines of sort/filter/paginate */ }, [...]);
  return <FindingsTableBody rows={rows} onSort={setSort} onFilter={setFilter} … />;
}
```

```tsx
// GOOD — extract the logic; the component states its intent
function FindingsTable({ findings }) {
  const { rows, sort, setSort, filter, setFilter } = useFindingsTable(findings);
  return <FindingsTableBody rows={rows} … />;
}
```

## Prop soup vs composition

```tsx
// BAD — five booleans is 32 possible states, most untested and some nonsense
<Panel title="Findings" isCompact hideHeader withBorder dense showFooter />
```

```tsx
// GOOD — consumers compose what they need
<Panel>
  <Panel.Header>Findings</Panel.Header>
  <Panel.Body>{children}</Panel.Body>
</Panel>
```

The parent holds the shared state and exposes children that read it through context, so the
API grows by composition instead of by flags.

## Chained barrels

```ts
// BAD — src/components/index.ts re-exporting other barrels
export * from "./app-shell";      // which re-exports ./AppShell
export * from "./diff-viewer";    // which re-exports 7 sub-component barrels
```

Importing one component pulls in all of them, and the cycles are hard to trace.

```ts
// GOOD — one barrel per folder, never chained
import { AppShell } from "@/components/app-shell";
import { DiffViewer } from "@/components/diff-viewer";
```

## `'use client'` placed too high

```tsx
// BAD — app/repos/[repoId]/layout.tsx
"use client";                 // …because one button in the header needs onClick

export default function RepoLayout({ children }) {
  return <Shell header={<RepoHeader />}>{children}</Shell>;
}
```

Everything this layout imports — and every descendant it renders directly — is now in the
client bundle.

```tsx
// GOOD — the boundary sits on the leaf that actually needs it
// app/repos/[repoId]/layout.tsx          (no directive — stays a Server Component)
// app/repos/[repoId]/_components/RefreshButton/RefreshButton.tsx
"use client";
export function RefreshButton() {
  return <button onClick={…}>Refresh</button>;
}
```

## Client shell wrapping server content

```tsx
// BAD — a Client Component cannot import a Server Component
"use client";
import { FindingsList } from "./FindingsList";   // Server Component — breaks
export function Drawer() {
  const [open, setOpen] = useState(false);
  return open ? <FindingsList /> : null;
}
```

```tsx
// GOOD — the server passes the content down as children
// page.tsx (Server Component)
<Drawer>
  <FindingsList />           {/* rendered on the server */}
</Drawer>

// Drawer.tsx
"use client";
export function Drawer({ children }) {
  const [open, setOpen] = useState(false);
  return open ? children : null;
}
```

## Magic numbers

```ts
// BAD — what is 120? why 320?
setTimeout(close, 120);
const width = 320;
```

```ts
// GOOD — constants.ts, colocated, self-documenting
/** Grace period before the portaled panel closes, so the pointer can cross the gap. */
export const CLOSE_DELAY_MS = 120;
export const PANEL_WIDTH = 320;
```

## Fetching from a component

```tsx
// BAD — no caching, no dedup, no shared error handling; repeated per component
useEffect(() => {
  fetch(`${base}/repos/${repoId}/pulls`).then(r => r.json()).then(setPulls);
}, [repoId]);
```

```tsx
// GOOD — one API client, one query hook, uniform error taxonomy
const { data: pulls = [], isLoading } = usePulls(repoId);
```

The hook is the app's data-access surface; components depend on it rather than on the
transport or the caching library.
