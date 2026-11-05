# Architecture overview

Two apps joined by one contract. Why: [`docs/adr/decisions.md`](../adr/decisions.md). How each flow behaves: `docs/specs/`.

```
   apps/web (Next.js)  -- imports -->  packages/contract  <-- imports --  apps/api (Fastify)
                                       Zod schemas + types

   apps/web  ------------ HTTP, JSON by the contract schemas ------------>  apps/api
   apps/web never imports apps/api; apps/api knows nothing about apps/web.
```

- [Backend](backend.md): event flow, dependencies, layers.
- [Frontend](frontend.md): layers and rules.
- `packages/contract`: the only place for API shapes ([0010](../adr/archive/0010-shared-contract-package.md)).
- The exact import rules are in `.dependency-cruiser.cjs`, checked by `pnpm check:deps`.
