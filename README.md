# Ultimate Pachanga — Roco Summer League

Web app for running an amateur Fútbol 7 league: players, matches, squad
selection, CSV-based post-match scoring, rankings and calculated market values,
presented as football cards.

Built for a single league (_Liga de verano roco_) and roughly 20 players, on
free-tier infrastructure. The database schema is multi-league from the start
even though the interface shows one.

## Status

**The MVP is feature-complete locally.** Register and sign in, browse the roster
as football cards, create matches and pick squads, score them by CSV, and read
the rankings — with league settings and member management for administrators.

| Stage | Scope                                                | State   |
| ----- | ---------------------------------------------------- | ------- |
| 0     | Vite + React + shadcn/ui scaffold, linting, CI       | ✅ Done |
| 1     | Database schema, RLS, scoring functions, views, seed | ✅ Done |
| 2     | Auth, routing, players and player cards              | ✅ Done |
| 3     | Matches and CSV results import                       | ✅ Done |
| 4     | Rankings, dashboard, admin settings, members         | ✅ Done |

Tests: 123 frontend (Vitest), 106 database (pgTAP). Verified in Chrome at 375 px:
every page renders and nothing scrolls horizontally.

Not yet done: deployment. The app runs against a local Supabase stack; pushing
it to Supabase Cloud and Cloudflare Pages is the remaining step.

## Technology

| Area           | Choice                                 |
| -------------- | -------------------------------------- |
| Web framework  | React 19 + TypeScript                  |
| Build system   | Vite 8                                 |
| Components     | shadcn/ui (Radix base) + Tailwind 4    |
| Routing        | React Router 8                         |
| Server state   | TanStack Query                         |
| Forms          | React Hook Form + Zod                  |
| CSV            | Papa Parse                             |
| Database       | Supabase PostgreSQL                    |
| Authentication | Supabase Auth (email + password)       |
| Player images  | Supabase Storage                       |
| Business logic | PostgreSQL functions and views         |
| Authorization  | PostgreSQL Row Level Security          |
| Tests          | Vitest + React Testing Library + pgTAP |
| CI             | GitHub Actions                         |

There is no custom backend. The browser talks to Supabase directly using the
publishable key, so **Row Level Security is the entire authorization
boundary** — every table has RLS enabled and all scoring logic lives in the
database.

## Prerequisites

- **Node.js 22.22+** (see `.nvmrc` — `nvm use` picks it up). React Router 8
  requires it.
- **Docker Desktop**, running. The local Supabase stack needs a container
  runtime.
- Git.

## Local setup

```bash
nvm use            # Node 22
npm install
cp .env.example .env.local
```

Start the database, then fill in `.env.local` with the values it prints:

```bash
npm run db:start
npm run db:status  # copy API URL and the anon/publishable key
```

```bash
# .env.local
VITE_SUPABASE_URL=http://127.0.0.1:54421
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from db:status>
VITE_APP_NAME=Roco Summer League
```

> The local API runs on **54421**, not Supabase's usual 54321, because another
> process already occupies 54321 on the maintainer's machine. Change
> `[api].port` in `supabase/config.toml` if you prefer the default, and keep
> `VITE_SUPABASE_URL` in step.

Then run the app:

```bash
npm run dev        # http://localhost:5173
```

> **Never** put a Supabase secret or service-role key in a `VITE_` variable —
> everything prefixed `VITE_` is bundled into the JavaScript served to every
> visitor.

## Commands

| Command                 | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `npm run dev`           | Dev server with HMR                                |
| `npm run build`         | Type-check and build to `dist/`                    |
| `npm run preview`       | Serve the production build locally                 |
| `npm run lint`          | ESLint                                             |
| `npm run format`        | Prettier, writing changes                          |
| `npm run format:check`  | Prettier, check only (what CI runs)                |
| `npm test`              | Vitest in watch mode                               |
| `npm run test:run`      | Vitest once                                        |
| `npm run test:coverage` | Vitest with coverage                               |
| `npm run db:start`      | Start the local Supabase stack                     |
| `npm run db:stop`       | Stop it                                            |
| `npm run db:status`     | Print local URLs and keys                          |
| `npm run db:reset`      | Recreate the database from migrations + `seed.sql` |
| `npm run db:test`       | Run pgTAP tests in `supabase/tests/`               |
| `npm run db:types`      | Regenerate `src/types/database.ts` from the schema |

Re-run `npm run db:types` after any schema change.

### Sign-in stops working after `db:reset`

`supabase db reset` restarts the auth container but not the API gateway, which
goes on routing to the old container's address. Sign-up and sign-in then fail
with "An invalid response was received from the upstream server". Restart the
gateway:

```bash
docker restart supabase_kong_ultimate-pachanga
```

## Repository layout

```text
src/
├── app/            router and providers
├── components/
│   ├── ui/         shadcn/ui primitives (vendored, kept close to upstream)
│   └── ...         application components (PlayerCard, MatchCard, ...)
├── features/       auth, league, players, matches, results, rankings
├── hooks/
├── lib/            supabase client, csv, scoring, formatting
├── pages/
└── types/          database.ts (generated)
supabase/
├── migrations/     schema, RLS, functions, views, storage policies
├── tests/          pgTAP
├── seed.sql        development data only
└── config.toml
```

## Scoring model

Metrics and attributes are configured per league in the database, not hardcoded.
The defaults are four 0–10 metrics (`attack`, `defence`, `tactics`, `physical`)
and five attributes (`mvp` +2, `revelation` +2, `zamora` +2, `puskas` +2,
`injury` −2).

```text
base_score       = mean of the active metric scores
attribute_points = sum of the assigned attribute point values
final_score      = base_score + attribute_points
```

`final_score` is deliberately not clamped to 0–10 — attributes can push it
outside that range.

Market value derives from `final_score` and is never stored, only exposed
through the `player_market_values` view:

```text
no matches   → the average market value of players who have played
one match    → latest_final_score × market_constant_gbp
two or more  → (0.5 × average of all previous + 0.5 × latest) × market_constant_gbp
```

The 0–99 card rating and per-metric card stats are presentation only,
`round(clamp(value × 10, 0, 99))`.

## Scoring a match

1. An administrator creates the match and selects the squad.
2. **Download CSV** produces a template with one row per convocated player.
3. Fill in the score columns; leave `Atributos` blank or list awards separated
   by `|`, e.g. `MVP|Puskas`.
4. **Subir resultados** parses the file, shows every problem it finds with the
   offending row number, and previews the base, attribute and final scores.
5. Importing calls a single PostgreSQL function that re-validates every row and
   writes them in one transaction. If any row is invalid, nothing is written.

Re-uploading a scored match corrects it: scores are replaced and a player's
attribute set is rewritten wholesale, rather than accumulating.

The parser is deliberately forgiving where it costs nothing — accents are
optional in headers and attribute names (`Tactica` matches `Táctica`, `Lesion`
matches `Lesión`), a decimal comma works as well as a point, and player codes
are case-insensitive. It is strict about anything that would corrupt a result:
unknown players, players who were not called up, duplicate rows, out-of-range
scores, and unknown or repeated attributes are all refused.

Templates are written with a UTF-8 byte order mark so Excel on Windows does not
mangle accented names.

## Roles

The **first account to register becomes the administrator** of the league;
everyone after that joins as a member. So register your own account before
sharing the URL, and once everyone is in, disable public sign-up in Supabase.

| Can                                         | Member | Admin |
| ------------------------------------------- | :----: | :---: |
| View the league, players, matches, rankings |   ✅   |  ✅   |
| Create, edit and deactivate players         |   —    |  ✅   |
| Upload player photographs                   |   —    |  ✅   |
| Create and edit matches, pick squads        |   —    |  ✅   |
| Download templates and import results       |   —    |  ✅   |
| Change league settings                      |   —    |  ✅   |
| Manage members and roles                    |   —    |  ✅   |

Every one of those restrictions is an RLS policy, not a hidden button, and each
is covered by a pgTAP test. A league can never be left without an administrator:
the database refuses the last one's demotion or removal.

## Deployment

Not yet configured. The target is Cloudflare Pages for the frontend
(`npm run build` → `dist`) and Supabase for the database, auth and storage.

The production checklist, when you get there:

1. Create a Supabase project in a European region and save the database
   password.
2. `npx supabase link --project-ref <ref>` then `npx supabase db push`. Never
   `db reset --linked` — it destroys the remote schema.
3. Set the Site URL and redirect URLs to the Pages domain.
4. Point Cloudflare Pages at this repository: build `npm run build`, output
   `dist`.
5. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_APP_NAME`
   as Pages environment variables.
6. Register your own account first and confirm it is the administrator, then
   share the URL and disable public sign-up.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Trademarks

This project is not affiliated with, endorsed by or connected to EA, FIFA or any
football club or competition. It contains no third-party logos, club crests,
official card templates or licensed player photography. The card presentation is
an original design inspired by the genre.

## License

[MIT](LICENSE)
