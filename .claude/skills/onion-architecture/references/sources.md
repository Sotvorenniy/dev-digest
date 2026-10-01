# Sources

## Onion Architecture
- Jeffrey Palermo — *The Onion Architecture*, [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/),
  [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/). The original:
  dependencies point to the core; infrastructure is on the outside; not for small apps.
- [Palermo's reference implementation (fork)](https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture)
- Herberto Graça — [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/): places it among layered, hexagonal and clean.
- Oliver Drotbohm — [Sliced Onion Architecture](http://odrotbohm.github.io/2023/07/sliced-onion-architecture/):
  rings *inside* vertical feature slices — the model this skill uses for `modules/<name>/`.
- Robert C. Martin — [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (the dependency rule).
- Alistair Cockburn — [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) (ports and adapters).

## Node.js / TypeScript
- Khalil Stemmler — [Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)
- [Ports and Adapters explained with two real codebases](https://saadh393.github.io/blog/adapter-port-architecture-two-cases):
  "application files can import ports, never adapters".

## Fastify
- [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) ·
  [Plugins guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) ·
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/)
- Snyk — [Fastify plugins as building blocks](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/)

## Drizzle
- Sentry — [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/):
  Drizzle transactions behind a TransactionManager, repositories that accept an optional tx.
- [Drizzle ORM best practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Transactions with DDD and the Repository pattern in TypeScript](https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901)

## Zod
- Alexis King — [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- [Parse, don't validate — in TypeScript](https://cekrem.github.io/posts/parse-dont-validate-typescript/)
- [Where Zod ends and the type system begins](https://dev.to/gabrielanhaia/runtime-validation-in-typescript-where-zod-ends-and-the-type-system-begins-4e9e):
  "parse at the boundary, infer the type, trust it everywhere inside".

## dependency-cruiser
- [Validate dependencies according to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)
- lastminute.com — [Enforcing architecture boundaries at scale](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/)
- cubic — [Maintaining clean architecture with dependency rules](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)
