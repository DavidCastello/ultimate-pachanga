# Production data

The league's real roster, fixtures and results, transcribed from the
spreadsheet. Run once against the deployed database, in order.

| Script            | Writes                                     | Rows |
| ----------------- | ------------------------------------------ | ---: |
| `01_roster.sql`   | `players`                                  |   22 |
| `02_fixtures.sql` | `matches`, `match_players`                 | 4+59 |
| `03_results.sql`  | `player_match_scores` and their attributes |   59 |

**These are not migrations, on purpose.** A migration is schema: something every
database carrying this application must have, applied automatically and never
rewritten. One league's roster is not that — it is content, it gets corrected,
and a second league would not want it. Reference data the app cannot function
without (the league row, its metrics, its awards) is in
`supabase/migrations/`; the league's own history is here.

**They are also the local seed.** `config.toml` lists them in `[db.seed]
sql_paths`, so `supabase db reset` loads the real league onto your machine from
these very files. The development database is the production database, which is
the point: what you see locally is what everyone will see, and every reset
rehearses the deploy. Two development-only files bracket them —
`seeds/00_dev_owner.sql` for the owner's account and
`seeds/02_dev_upcoming_match.sql` for a fixture still to be played. Neither has
any counterpart in production, and seed files are never carried by
`supabase db push`.

All three are re-runnable. They match on natural keys — `player_code`, fixed
match ids, `(match_id, player_id)` — so a second run corrects rather than
duplicates. `01_roster.sql` never touches `user_id`, `avatar_path` or
`is_active`, and `02_fixtures.sql` leaves an arrangement alone once anyone has
been placed on the pitch, so nothing a player or administrator has since done
in the app is overwritten.

## Order

```text
1. supabase db push                       schema, RLS, functions, views
2. register dcastellotejera@gmail.com     in the app; this is the administrator
3. 01_roster.sql
4. 02_fixtures.sql
5. 03_results.sql
```

Step 2 is a real dependency, not a convention. `03_results.sql` calls
`public.import_match_scores` — the same function the CSV upload calls — and that
function refuses anyone who is not a league administrator. The script therefore
runs _as_ the owner: it looks the account up by `app.owner_email()`, sets
`request.jwt.claims` for the transaction so `auth.uid()` resolves to it, and
switches to the `authenticated` role. With no owner account it stops with a
message saying so rather than failing obscurely inside the function.

Going through the function rather than inserting rows directly is the point:
`final_score` is **stored**, so whatever writes it defines the league table.
These four historical matches are scored by exactly the same code as every
future one, and every row is validated — an unknown code, a player who was not
called up, a duplicate, an out-of-range score or an unknown award aborts the
whole import instead of writing half a match.

## Running them

### Supabase SQL Editor

The path that needs nothing installed. Dashboard → **SQL Editor** → paste the
whole file → Run. One file at a time, in order. Each ends with an assertion that
raises if the counts are wrong, so a green run means the data is complete.

### psql

Wanted for anything repeatable. The connection string is in the dashboard under
**Project Settings → Database → Connection string → psql**; it needs the
database password chosen when the project was created.

macOS does not ship `psql`:

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
```

Then, from the repository root:

```bash
export PROD_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'
make prod-load
```

`make prod-load` runs all three in order and stops at the first failure.
`make prod-roster`, `make prod-fixtures` and `make prod-results` run them
individually.

Keep `PROD_DB_URL` in the shell or in a file git ignores. It contains the
database password, which is a full-access credential — it is not a publishable
key and must never end up in a `VITE_` variable or in `.env.cloud.local`.

### The rehearsal is automatic

```bash
make db-reset
```

That is the rehearsal. It applies the migrations and then these three scripts,
so if any of them would fail against production it fails here first — and CI
runs the same thing on every push. Nothing extra to remember.

```bash
make prod-dry-run
```

Runs them a second time on top of the already-seeded database. Not how you load
the data locally — `db reset` did that — but how you check the property that
makes them safe to re-run against production: the counts must come out
identical.

Locally you can sign in immediately as `dcastellotejera@gmail.com` /
`pachanga`, which `seeds/00_dev_owner.sql` creates. That account is an
administrator with no player claimed, so the join flow is walkable rather than
skipped.

One figure will differ from production and it is not a bug: **card ratings and
market values are relative**, measured against everyone else's latest score. The
development database has one extra fixture (Jornada 5, unscored) which does not
move them, so in practice the numbers do line up — but any local player you add
or score will shift everybody's rating, there and in production alike.

## Reading the data back

```sql
-- The league table as the app renders it.
select player_code, display_name, matches_played, card_rating,
       latest_score, career_average, market_value_gbp,
       total_goals, total_victories
from public.player_cards
order by card_rating desc;

-- One match, score by score.
select p.player_code, mp.team_side, s.metric_scores, s.goals, s.victory,
       s.base_score, s.attribute_points, s.final_score
from public.player_match_scores s
join public.players p on p.id = s.player_id
join public.match_players mp
  on mp.match_id = s.match_id and mp.player_id = s.player_id
where s.match_id = '44444444-4444-4444-8444-000000000001'
order by mp.team_side, s.final_score desc;
```

## Editing the data afterwards

Full read/write access to every table is in the dashboard: **Table Editor** to
browse and edit rows, **SQL Editor** for anything else. Both run as `postgres`,
which owns the tables, so **Row Level Security does not apply** — the policies
that constrain the app do not constrain you there. Any Postgres client works
equally well against the connection string above: TablePlus, DataGrip, DBeaver,
`psql`.

Safe to edit by hand, because nothing is derived from it:

| Table               | Columns                                                         |
| ------------------- | --------------------------------------------------------------- |
| `players`           | names, `nickname`, `preferred_position`, `is_active`, `user_id` |
| `matches`           | `title`, `location`, `played_at`, team names, formations        |
| `match_players`     | `team_side`, `pitch_slot`, `attendance_status`                  |
| `leagues`           | `title`, `market_constant_gbp`                                  |
| `league_members`    | `role`                                                          |
| `league_metrics`    | labels, `display_order`, `is_active`                            |
| `league_attributes` | `label`, `points`, `is_active`                                  |

**Do not hand-edit a score.** `base_score`, `attribute_points` and `final_score`
in `player_match_scores` are computed at import time and **stored**; the
rankings, market values and card ratings all read those columns. Changing
`metric_scores` in the table editor updates none of them, and the league table
then silently disagrees with the scores it claims to be built from.

To correct a result, re-import it — which recomputes everything and is designed
to be done twice:

- **In the app:** open the match, download the CSV, fix the row, upload it
  again. Scores are replaced and a player's award set is rewritten wholesale.
- **In SQL:** edit the offending row in `03_results.sql` and run the file again.

Two more things worth knowing before reaching for the table editor:

- **Never `supabase db reset --linked`.** It drops and recreates the remote
  schema, taking this data with it. Schema changes go out as a new migration
  and `supabase db push`.
- **Codes here are motes, not generated.** `01_roster.sql` sets `player_code`
  to the spreadsheet's «Mote» (`DAVID-C`, `SERGIO-M`) because a human types
  them into the results CSV. Players created later through the app get a
  generated `PLR-XXXX` instead, which is fine — nothing requires one style.

## What the transcription decided

Four judgement calls are baked into these files; each is a small edit if it was
the wrong one.

- **Scores are the spreadsheet's 1–5 doubled.** The league's metrics are
  configured 0–10 in migration 001 and the cards divide by that maximum, so a
  4 out of 5 is stored as 8 and draws as 80/99 rather than 40/99. Halve any
  value in `03_results.sql` to read it back as written.
- **The «ESP» column is dropped.** It held 1 for some awards and 2 for others;
  every award is worth 2 points in the current model, so only «ESP Cat» — the
  award itself — is carried over.
- **Positions are inferred from the aliases.** The spreadsheet records none, so
  Oblak keeps goal and Van Nistelrooy plays up front. It decides the label on
  the card and the opening arrangement on the pitch, nothing more.
- **Pitch arrangements are derived, not recorded.** The spreadsheet says who
  played, never where. Slots are filled keeper-first, back to front, so each
  match opens on a plausible 2-3-1 rather than an empty pitch with the whole
  squad on the bench. Drag anyone into place in the app; re-running
  `02_fixtures.sql` will not undo it.

One transcription oddity is preserved rather than corrected: in Jornada 4,
drawn, every «VICT» cell reads 0,5 except PERICO's, which reads 1. It is
imported as 1. There is a comment at that row in `03_results.sql`.
