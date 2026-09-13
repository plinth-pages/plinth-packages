# plinth-packages

npm packages that every Plinth portfolio depends on.

| Package | What | Installed as |
|---|---|---|
| `@plinth/core` | `<Slot>`, the slot vocabulary, the `plinth.json` schema | dependency |
| `@plinth/check` | `plinth check` — verifies a portfolio still honours the slot contract | devDependency |

Integration packages (`@plinth/leetcode-stats`, …) are added here from Phase 10.

## Why two packages, not one

`plinth check` parses TypeScript with ts-morph, which bundles the TypeScript compiler. Shipping that
inside `@plinth/core` would put a compiler in every portfolio's production dependencies. The validator
is only needed in CI and in the platform's safety net, so it is a devDependency.

## Develop

```bash
pnpm install
pnpm build
pnpm test
pnpm pack:local   # tarballs in dist-packs/, used by plinth-template until the packages are on npm
```

## The contract

Slot names live in `packages/core/src/slots.ts`. **Adding a slot is safe. Renaming or removing one
breaks every existing portfolio** — generated repositories never re-sync from the template, so it
requires a migration codemod across the fleet.
