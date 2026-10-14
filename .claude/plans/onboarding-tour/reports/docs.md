# Documentation Report: Onboarding Tour (SPEC-02)

## Files
- NEW `docs/onboarding-tour.md` — generate flow (Mermaid sequence), skeleton reasons, reading-path ranking, grounding, candidate commands + `README_UNSAFE`, prompt budget, limits, API, log line, client surfaces.
- `docs/README.md` index line; `server/docs/README.md`, `client/docs/README.md`, `e2e/docs/README.md` pointer lines.
- `specs/2026-10-14-onboarding-tour.md` → `Status: implemented`; `specs/README.md` index line → implemented.
- Applied by main session (outside doc-writer scope): `server/README.md` API map node, `client/README.md` route map, `e2e/README.md` flow 08 row.

## Gaps (for spec-creator, non-blocking)
- Plan §0 gaps 1 (40-file cap vs `truncated`), 4 (snake_case i18n reason keys), 5 (NFR5 "renders as text" vs Markdown dropping raw HTML) not yet recorded in the spec.
- 200-char README command cap is in code, not in plan/spec.
- AC4 wording vs no Regenerate button without a stored tour.
- `server/test/onboarding.it.test.ts` not run in this run (Docker).
