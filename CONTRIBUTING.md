# Contributing

## Getting set up

See [Local setup](README.md#local-setup) in the README. You need Node 22.22+ and
a running Docker daemon.

## Before opening a pull request

CI runs exactly these, so run them locally first:

```bash
make verify        # check, both test suites and the build
```

Or individually:

```bash
npm run lint
npm run format:check
npm run test:run
npm run build
npm run db:reset   # requires Docker
npm run db:test
```

## Conventions

### Commits

Conventional Commits — `type(scope): description`, with types `feat`, `fix`,
`docs`, `refactor`, `test`, `chore`. Keep commits atomic and explain _why_ in the
body when the reason isn't obvious.

### TypeScript

- No `any`. Use `unknown` and narrow.
- `Type | None`-style unions (`X | undefined`) over wrapper types.
- Prefer `as const` object maps and derived unions over `enum`.
- Prefer `interface` for object shapes.
- Name things concretely: `calculateMarketValue()`, not `process()`.
- Booleans read as predicates: `isActive`, `hasPlayed`, `shouldConfirm`.
- `async`/`await` with `try`/`catch`, never `.then()` chains.

### Database is the source of truth

Scoring and market values are computed in PostgreSQL. `src/lib/scoring.ts`
mirrors those formulas so the CSV preview can show results before import — it is
display-only. If you change a formula, change it in **both** places and update
the tests on both sides.

### Row Level Security

Every table has RLS enabled and the browser holds only the publishable key.
Hiding a button in React is not authorization. Any new table needs policies in
the same pull request, plus a pgTAP test proving a member cannot mutate it.

### Migrations

Never edit an applied migration — add a new one. Regenerate types afterwards:

```bash
npm run db:types
```

### Components

`src/components/ui/` is vendored from the shadcn registry. Avoid editing those
files so `shadcn add --overwrite` stays a clean operation; put customisation in
`src/components/`.

Note that shadcn's `CardTitle` renders a `<div>`. Wrap page titles in a real
heading element so the document outline stays navigable.

## What not to commit

- `.env`, `.env.local`, `.env.cloud.local` — only `.env.example` is tracked.
- Supabase secret or service-role keys, anywhere, ever.
- Third-party football assets: EA/FIFA trademarks, club crests, official card
  templates, or player photography you don't have permission to use.
