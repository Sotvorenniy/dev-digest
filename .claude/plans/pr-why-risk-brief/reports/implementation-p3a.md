# Implementation Report — Phase 3a (Steps 10-13) — done (Step 13 partial by design)
Files: client/src/lib/hooks/brief.ts (new) + hooks/index.ts; client/messages/en/brief.json; OverviewTab/_components/PrBriefCard/** (new: PrBriefCard, styles, constants, helpers, index, RiskRow, ReviewFocusList); OverviewTab.tsx; page.tsx.
Checks: check-changed client PASS; client --full PASS (250 tests).
Hooks: data-pr-brief, data-brief-status (aria-live always mounted), data-brief-generate/refresh/retry, data-brief-error=<kind>, data-brief-risks, data-brief-focus, data-brief-missing, data-risk-row, data-risk-severity, data-review-focus. Helpers: isStale, briefErrorKind, reviewFocusHref.
Deviation: Step 13 did NOT pass focusFile/focusLine to DiffTab (props don't exist until Step 14). Phase 3b must add props to DiffTab and pass focusFile={search.get("file")} focusLine={search.get("line")} at <DiffTab> in page.tsx.
latestReview prop accepted by PrBriefCard but unused (for Step 15). Severity colours --crit/--warn/--info (+ -bg) unverified.
Href: /repos/<repoId>/pulls/<n>?tab=diff&file=<f>&line=<l>.
Suggested INSIGHTS: ReviewRecord not re-exported from @/lib/types; body-less api.post omits content-type.
