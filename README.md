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
| 5     | Accounts linked to players, join flow, own profile   | ✅ Done |
| 6     | Goals, victories, sum-based scores, relative ratings | ✅ Done |

Tests: 249 frontend (Vitest), 149 database (pgTAP). Stages 0–4 were verified in
Chrome at both desktop and 375 px: every page renders, nothing scrolls
horizontally, and a real pointer drag rearranges a line-up and persists it. The
stage 5 and 6 changes — joining, the profile page, and the reworked scoring —
are covered by tests but have not had that manual pass yet.

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
make install
cp .env.example .env.local
```

Start the database, then fill in `.env.local` with the values it prints:

```bash
make db-start
make db-status     # copy API URL and the anon/publishable key
```

```bash
# .env.local
VITE_SUPABASE_URL=http://127.0.0.1:54421
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from db-status>
VITE_APP_NAME=Roco Summer League
```

> The local API runs on **54421**, not Supabase's usual 54321, because another
> process already occupies 54321 on the maintainer's machine. Change
> `[api].port` in `supabase/config.toml` if you prefer the default, and keep
> `VITE_SUPABASE_URL` in step.

Then run the app:

```bash
make dev-local     # http://localhost:5173
```

> **Never** put a Supabase secret or service-role key in a `VITE_` variable —
> everything prefixed `VITE_` is bundled into the JavaScript served to every
> visitor.

### Local or deployed

There are two ways to run the app, differing only in which database it talks
to:

| Command          | Database                       | Env file           |
| ---------------- | ------------------------------ | ------------------ |
| `make dev-local` | the Supabase stack on this Mac | `.env.local`       |
| `make dev`       | the deployed Supabase project  | `.env.cloud.local` |

Both files are ignored by git. Vite loads `.env.cloud.local` only in cloud mode
and it outranks `.env.local`, so the two never mix — and `make dev` refuses to
start rather than falling back to the local database if the file is missing,
because silently editing the production league while believing you are on a
scratch database is the one failure worth being loud about.

No deployed project exists yet, so `make dev` will stop with instructions until
one does.

## Commands

`make` with no target lists these. Every one delegates to the `npm run` script
of the same name, which still works if you prefer it.

| Command           | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `make dev-local`  | Dev server against the local stack                 |
| `make dev`        | Dev server against the deployed database           |
| `make build`      | Type-check and build to `dist/`                    |
| `make preview`    | Serve the production build locally                 |
| `make lint`       | ESLint                                             |
| `make format`     | Prettier, writing changes                          |
| `make check`      | Prettier and ESLint, check only (what CI runs)     |
| `make test`       | Vitest once                                        |
| `make test-watch` | Vitest in watch mode                               |
| `make coverage`   | Vitest with coverage                               |
| `make verify`     | Check, both test suites and the build              |
| `make db-start`   | Start the local Supabase stack                     |
| `make db-stop`    | Stop it                                            |
| `make db-status`  | Print local URLs and keys                          |
| `make db-reset`   | Recreate the database from migrations + `seed.sql` |
| `make db-test`    | Run pgTAP tests in `supabase/tests/`               |
| `make db-types`   | Regenerate `src/types/database.ts` from the schema |

Re-run `make db-types` after any schema change.

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
├── features/       auth, onboarding, league, players, matches, results,
│                   rankings
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

A result also records, per player, the goals they scored and their share of the
win — 1 won, 0 lost, 0.5 drawn, and anything between for a game settled some
other way.

```text
base_score       = sum of the active metric scores          (0–40 by default)
attribute_points = sum of the assigned attribute point values
victory_points   = victory × 2
final_score      = base_score + attribute_points + victory_points
```

A sum rather than a mean, so being good at everything beats being good at one
thing. `final_score` is deliberately unclamped — attributes push it above the
metric total and below zero, and both are intended.

**Goals do not score.** They are recorded and displayed, and that is all.

Where each formula lives, because three of them are easy to lose:

| Formula       | Source of truth                                                     |
| ------------- | ------------------------------------------------------------------- |
| `final_score` | `import_match_scores`, migration 009 — computed once and **stored** |
| Market value  | view `player_market_values`, migration 009 — derived on every read  |
| Card rating   | `to_card_rating` + the same view — derived on every read            |

`src/lib/scoring.ts` mirrors the first of those so the upload dialog can preview
a file before importing it. It is display-only, and it has to move whenever the
migration does.

That final score is stored has a consequence worth remembering: changing the
formula does not retroactively fix matches already imported. Migration 009
recomputed them once from the `metric_scores` stored alongside; a future change
needs the same treatment.

Market value is never stored:

```text
no matches   → the average market value of players who have played
one match    → latest_final_score × market_constant_gbp
two or more  → (0.5 × average of all previous + 0.5 × latest) × market_constant_gbp
```

Only scored matches count, so a fixture nobody has played never drags a
valuation down. `market_constant_gbp` is a per-league setting, 3,000,000 by
default.

### The card rating

The 0–99 rating is a **standing, not a measurement**: where a player's most
recent score falls in the spread of everybody's most recent score.

```text
rating = clamp(round(70 + 12 × (latest − league_mean) / league_stddev), 45, 99)
```

Centred on 70, bounded at 45 and 99, twelve points per standard deviation — so
a normal league puts most of the squad between roughly 55 and 85 and only a
genuine outlier reaches the ends. A player nobody can be compared against, or
one who has never been scored, sits at 70.

Two consequences fall out of that and are by design. A rating moves when _other
people_ play, and every rating shifts after each match. The card shows current
standing; career figures live in `career_average` and market value.

Per-metric card stats are unaffected — still `round(clamp(average × 10, 0, 99))`
over a 0–10 metric, still presentation only.

## Scoring a match

1. An administrator creates the match and selects the squad.
2. **Download CSV** produces a template with one row per convocated player.
3. Fill in the score columns, `Goles`, and `Victoria` (1, 0 or 0,5). Leave
   `Atributos` blank or list awards separated by `|`, e.g. `MVP|Puskas`.
4. **Subir resultados** parses the file, shows every problem it finds with the
   offending row number, and previews the base, attribute, victory and final
   scores.
5. Importing calls a single PostgreSQL function that re-validates every row and
   writes them in one transaction. If any row is invalid, nothing is written.

Re-uploading a scored match corrects it: scores are replaced and a player's
attribute set is rewritten wholesale, rather than accumulating.

The parser is deliberately forgiving where it costs nothing — accents are
optional in headers and attribute names (`Tactica` matches `Táctica`, `Lesion`
matches `Lesión`), a decimal comma works as well as a point, and player codes
are case-insensitive, and a blank `Goles` cell means none. It is strict about
anything that would corrupt a result: unknown players, players who were not
called up, duplicate rows, out-of-range scores, fractional or negative goals,
and unknown or repeated attributes are all refused.

`Victoria` gets no such leniency. A blank cell is an error rather than a
defeat, and a template downloaded before the column existed is refused
outright — a win is worth two points, and there is no safe default between
having won and having lost.

Templates are written with a UTF-8 byte order mark so Excel on Windows does not
mangle accented names.

## Line-ups on the pitch

Every match shows both squads on a pitch, whatever its status — before kickoff
it is the plan, afterwards the record of who played where. Each side gets its
own pitch, drawn with their goal at the bottom so the attack points upwards, and
players appear as the same football cards used everywhere else.

Fútbol 7 means seven a side: the goalkeeper is always at the foot of the pitch,
and the formation describes the six outfielders.

| Formation | Shape                                                         |
| --------- | ------------------------------------------------------------- |
| `2-3-1`   | Default: two at the back, three across midfield, one up front |
| `3-3`     | Two lines of three                                            |
| `3-2-1`   | Three, two, one                                               |
| `1-3-2`   | A sweeper, three across, two up front                         |

Each team's formation is chosen independently.

Administrators can rearrange a line-up by **dragging one player onto another**,
which swaps them. Tapping one and then the other does the same thing and is
easier on a phone; keyboard users get the same via Enter, with Escape to cancel.
Swaps work across both teams and the bench, so moving someone between sides or
on and off is one gesture. Members see the same pitch, read-only.

Positions are stored per match, so an arrangement survives a reload. The
database enforces one player per position per side.

Dragging uses Pointer Events rather than HTML5 drag-and-drop, which does not
fire on touch devices at all.

## Accounts and players

One account, one player. A player record is a league record — most of the
roster is created by an administrator long before anyone signs in — and
`players.user_id` is what links a person to their card once they do.

**Registering grants nothing.** A new account has no membership and no player,
and sees nothing at all until it joins a league. There are two ways in, and the
join screen offers them in this order:

1. **Claim yourself off the roster.** The administrator has already created the
   players; whoever registers picks the one they are. Two people racing for the
   same player is settled by the database, not by who clicked first in the UI.
2. **Create your own player.** Offered when nothing is left to claim, and
   reachable from a link otherwise. Nobody who was simply forgotten when the
   roster was typed up ends up locked out.

The **owner's email address is the administrator** — `dcastellotejera@gmail.com`,
in `app.owner_email()`. That account is an administrator from its first
sign-in and still picks which player it is, like everyone else. Every other
account joins as a member. Nothing depends on who registers first any more.

| Can                                         | Member | Admin |
| ------------------------------------------- | :----: | :---: |
| View the league, players, matches, rankings |   ✅   |  ✅   |
| Edit their own name, nickname, position     |   ✅   |  ✅   |
| Upload their own photograph                 |   ✅   |  ✅   |
| Create, edit and deactivate any player      |   —    |  ✅   |
| Upload any player's photograph              |   —    |  ✅   |
| Create and edit matches, pick squads        |   —    |  ✅   |
| Download templates and import results       |   —    |  ✅   |
| Change league settings                      |   —    |  ✅   |
| Manage members and roles                    |   —    |  ✅   |

Every one of those restrictions is enforced in the database, not by a hidden
button, and each is covered by a pgTAP test. A league can never be left without
an administrator: the database refuses the last one's demotion or removal.

Row Level Security cannot restrict _columns_, so "a member may edit these five
fields of their own player and nothing else" cannot be a policy — an update
policy wide enough to let someone rename themselves would also hand them their
import code and their active flag. Those edits therefore go through
`update_own_player_profile` and `set_own_player_avatar`, which name the
editable fields explicitly. Joining works the same way and for a related
reason: the caller is by definition not yet a member, so no policy on `players`
or `leagues` could see the rows the flow needs.

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
   as Pages environment variables, and the same values locally in
   `.env.cloud.local` so `make dev` can reach the project.
6. Turn on email confirmation in the Supabase auth settings. It is off locally
   and unverified addresses should not be able to claim a player.
7. Register `dcastellotejera@gmail.com`, confirm it is the administrator, and
   create the roster.
8. Share the URL. Sign-up can stay open — an account that has not claimed a
   player sees nothing — but disabling it once everyone is in removes the last
   way a stranger could add themselves to the roster.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Trademarks

This project is not affiliated with, endorsed by or connected to EA, FIFA or any
football club or competition. It contains no third-party logos, club crests,
official card templates or licensed player photography. The card presentation is
an original design inspired by the genre.

## License

[MIT](LICENSE)
