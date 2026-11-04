# Frontend architecture

How `apps/web` is organised. See also: [overview](overview.md), [0007](../adr/0007-polling-for-progress.md), [0013](../adr/0013-tooling-choices.md).

## Layers

Arrow = "may import", top to bottom only.

```
app/           pages: /  and  /documents/[id] (the POC has / only) — only compose features
   |
   v
features/      lawyer · quota · documents · review (the POC has review only) — do not import each other
   |        |
   v        v
api/        ui/
fetch,      shadcn components
lawyer
header,
errors
   |
   v
packages/contract
```

## Rules

- **No business rules here:** whether a review can be requested, the order of findings and the remaining plan come from the API.
- **Every response is validated:** in `api/`, a response starts as `unknown` and is parsed with its schema from `packages/contract` ([0016](../adr/0016-web-validates-api-responses.md)).
- The API is reached through a Next.js rewrite: `/api/*` goes to `http://127.0.0.1:3001/*`. One origin, no CORS.
- Components are generated into `apps/web/src/ui/`. We write no styles of our own; Tailwind only for page layout.

## Why some imports are forbidden

- `apps/web` never imports `apps/api`; shared types live only in `packages/contract`.
- Features do not import each other.
- `app/` may import `ui/` for the page's button and shared layout. It must not import `api/`.
