# Architecture — client (@devdigest/web)

Deep-dive behind `client/CLAUDE.md`. Stack, commands and the route map are in
`client/README.md` and are not repeated here.

## Data flow

Every screen reads the Fastify API through one path: `src/lib/api.ts`
(`apiFetch` → `api.get/post/put/patch/del`, base `NEXT_PUBLIC_API_BASE`,
default `http://localhost:3001`) → TanStack Query hooks in `src/lib/hooks/*` →
components. Never call `fetch` directly from a component; add a hook instead.

- `apiFetch` normalizes failures into `ApiError { status, code, details }`; a
  network failure is `status: 0`.
- `src/lib/providers.tsx` surfaces errors globally: **mutations always toast**,
  **queries toast only on status 0 or ≥500**, so expected 4xx (e.g. a 404 "not
  generated yet") can drive inline empty states.
- `src/lib/hooks/index.ts` is the barrel (`core`, `agents`, `reviews`, `trace`,
  `repo-intel`). Long-running work polls with a conditional `refetchInterval`
  (4 s while any run is `running`, `false` otherwise) — see `hooks/reviews.ts`.
- Provider stack: QueryClient → Theme → Toast → Repo. Query defaults:
  `retry: 1`, `staleTime: 30_000`, no refetch on focus.

## Active repo

`src/lib/repo-context.tsx` resolves it as URL `:repoId` >
`localStorage["dd-repo"]` > first repo from `useRepos()`. Use `useActiveRepo()`;
don't re-derive it from the pathname.

## Theming

Dark/light via `data-theme` on `<html>`, set before paint by the inline
`themeNoFlashScript` (`src/lib/theme.tsx`) and persisted to
`localStorage["dd-theme"]`. All colors are CSS variables (`var(--accent)`,
`var(--text-muted)`, `var(--border)`).

## Vendored packages

- `@devdigest/ui` → `src/vendor/ui` — import only from the barrel, never a layer
  file. Layers and tokens: `client/src/vendor/ui/README.md`.
- `@devdigest/shared` → `src/vendor/shared` — Zod contracts, a copy of
  `server/src/vendor/shared` that has already drifted. Type-only imports (see
  `client/CLAUDE.md`). `src/lib/types.ts` re-exports the contract types the UI
  needs plus UI-only view models.

## Routing & chrome

`src/app/**/page.tsx`. Pages are thin and mostly `"use client"`; the RSC work is
`app/layout.tsx` (locale + messages). Every screen renders inside
`<AppShell crumb={…}>` (`src/components/app-shell` — wires `AppFrame`, Cmd+K
palette, `?` help, `g`-then-key navigation) with `PageContainer` from
`src/components/page-shell`. Nav items, settings sections and the shortcut
registry are declared in `src/vendor/ui/nav.ts` (`:repoId` token resolved by
`resolveHref`).

## i18n

`next-intl`, single locale `en`, no locale routing. Messages are split per
feature namespace in `messages/en/<ns>.json` and merged by `src/i18n/request.ts`
(a new file is picked up automatically). Use `useTranslations("<ns>")`.
User-facing strings go in the namespace JSON, not inline in JSX.

## Tests

vitest + jsdom + React Testing Library; `src/test/setup.ts` loads `jest-dom` and
stubs `ResizeObserver` (Recharts). Only `src/**/*.test.{ts,tsx}` is collected.
Tests are hermetic — no API, DB or browser. A component test renders with the
providers it needs, importing the real message JSON:

```tsx
render(
  <QueryClientProvider client={new QueryClient()}>
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>{ui}</NextIntlClientProvider>
  </QueryClientProvider>,
);
```

Real browser journeys live in `e2e/`; strategy in `TESTING.md`.
