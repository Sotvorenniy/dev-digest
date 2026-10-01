# Testing by ring

The payoff of the onion is that the inner rings are testable without Docker.

| Ring | Test type | Lane | How |
|---|---|---|---|
| `domain.ts` | Pure unit | hermetic (`*.test.ts`) | Call functions, assert values. No mocks at all. |
| `service.ts` | Unit with **fakes of ports** | hermetic (`*.test.ts`) | Hand-written in-memory implementations of the port interfaces |
| `repository.ts` | Integration | Docker (`*.it.test.ts`) | `test/helpers/pg.ts` testcontainer, real migrations |
| `routes.ts` | Route smoke | hermetic | `app.inject()` with a Container built from `ContainerOverrides` / fake services (`test/routes-smoke.test.ts`) |
| adapters | Contract / unit | hermetic | Against recorded payloads; the mocks in `src/adapters/mocks.ts` |

Rules:
- **Fakes, not mocks, for ports.** A 20-line `InMemoryAgentsRepository implements
  AgentsRepositoryPort` is reusable and type-checked against the port; `vi.mock` of a
  module path couples the test to file layout.
- A test that imports `test/helpers/pg.ts` **must** be `*.it.test.ts` (`server/AGENTS.md`).
  If a service test needs Postgres, the service is reaching past its port.
- Run: `./node_modules/.bin/vitest run --exclude '**/*.it.test.ts'` (hermetic) and
  `./node_modules/.bin/vitest run .it.test` (Docker).
