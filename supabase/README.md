# The database, explained slowly

Everything the app stores and everything it knows about who you are lives in
Supabase. This is the plain-language guide to running it: what the two
databases are, how to change them safely, and how sign-in works.

For the league's actual data — the roster, the fixtures, the results — see
[`production/README.md`](production/README.md). For the scoring rules, the
[root README](../README.md).

---

## 1. There are two databases

That is the single most important thing on this page. They are completely
separate: separate tables, separate accounts, separate passwords.

|                     | **Local**                         | **Production**                         |
| ------------------- | --------------------------------- | -------------------------------------- |
| Runs on             | Docker, this machine              | Supabase Cloud, `sbplcaoenljkbhlhuokg` |
| Start it with       | `make db-start`                   | always on                              |
| App talks to it via | `make dev-local`                  | `make dev`                             |
| Env file            | `.env.local`                      | `.env.cloud.local`                     |
| Who sees it         | you                               | the whole league                       |
| Safe to break       | yes — `make db-reset` rebuilds it | **no**                                 |

Both commands run the website on your laptop. The difference is only which
database the browser is talking to. **`make dev` writes to the real league** —
score a match there and it is scored for everybody.

So: `make dev-local` while building, `make dev` only when you mean it.

### Where to click

|               | Local                                    | Production                 |
| ------------- | ---------------------------------------- | -------------------------- |
| Table browser | http://127.0.0.1:54323                   | dashboard → Table Editor   |
| Email inbox   | http://127.0.0.1:54324                   | real inboxes               |
| Sign in as    | `dcastellotejera@gmail.com` / `pachanga` | the account you registered |

The local owner password is in `seeds/00_dev_owner.sql` and is hardcoded on
purpose: seed files never run against a deployed project.

---

## 2. Everyday commands

```bash
make db-start     # start the local stack (Docker must be running)
make db-stop      # stop it
make db-status    # local URLs and keys
make db-reset     # wipe local, replay migrations + seeds — your undo button
make db-test      # the 187 pgTAP tests
make db-types     # regenerate src/types/database.ts after a schema change
```

`make db-reset` is the one to remember. It throws the local database away and
rebuilds it from scratch in about a minute: schema, then the real league's data.
Nothing you can do locally is unrecoverable.

---

## 3. What is in this folder

| Path          | What it is                                                           |
| ------------- | -------------------------------------------------------------------- |
| `migrations/` | The schema. Numbered, applied in order, **never edited once pushed** |
| `production/` | The league's real data. Re-runnable, not migrations                  |
| `seeds/`      | Local-only extras: the dev owner, an unplayed fixture                |
| `tests/`      | pgTAP tests — every permission rule has one                          |
| `templates/`  | The confirmation email                                               |
| `snippets/`   | Handy queries                                                        |
| `config.toml` | Settings for the **local** stack only                                |

The `config.toml` line matters: editing it changes your machine, never
production. Production settings live in the dashboard. (`supabase config push`
exists, but do not run it here — it would overwrite production's Site URL with
`127.0.0.1`.)

---

## 4. Changing the schema

The rule: **a schema change is a new file, never an edit to an old one.**

Migrations are applied once and recorded. Editing `003_...sql` after it has run
changes nothing in any database that already has it — you get a schema that
disagrees with itself, and no error saying so.

```bash
# 1. New file, next number, describing what it does
#    supabase/migrations/011_whatever_you_are_adding.sql

# 2. Prove it from scratch
make db-reset          # replays every migration + the real data
make db-test           # permissions still hold?
make db-types          # TypeScript types follow the schema

# 3. Only now, production
npx supabase db push --db-url "$PROD_DB_URL"
```

`make db-reset` is the rehearsal, and CI runs it on every push, so a migration
that would fail against production fails on your laptop first.

### Connecting to production from the terminal

```bash
export PROD_DB_URL='postgresql://postgres.sbplcaoenljkbhlhuokg:<password>@aws-0-eu-north-1.pooler.supabase.com:5432/postgres'
```

The password is the database password from **Project Settings → Database** —
a full-access credential. Keep it in your shell or a git-ignored file. Never in
a `VITE_` variable: those are bundled into the JavaScript every visitor
downloads.

`npx supabase db push --db-url "$PROD_DB_URL"` works without logging the CLI in.
For `supabase link`, `db pull` or `gen types --linked` you need a personal
access token from https://supabase.com/dashboard/account/tokens, exported as
`SUPABASE_ACCESS_TOKEN`.

### Backups

The free plan has no automated backups. Before anything risky:

```bash
npx supabase db dump --db-url "$PROD_DB_URL" -f backup.sql          # schema
npx supabase db dump --db-url "$PROD_DB_URL" --data-only -f data.sql # rows
```

Both are git-ignored by the `*.local`/`.env` rules only if you name them so —
put them somewhere outside the repo.

---

## 5. Looking at and editing the data

Dashboard → **Table Editor** to browse and edit, **SQL Editor** for anything
else. Both run as the `postgres` superuser, so Row Level Security does not
apply — the rules that constrain the app do not constrain you there. Any
Postgres client works too: TablePlus, DBeaver, `psql`.

**Do not hand-edit a score.** `base_score`, `attribute_points` and `final_score`
are computed at import and _stored_; the rankings and market values read those
columns. Changing `metric_scores` in the table editor updates none of them and
the league table silently disagrees with itself. To fix a result, re-import it —
in the app (download the CSV, fix, re-upload) or by editing `03_results.sql` and
running it again.

Safe to edit by hand: names, nicknames, positions, match titles and locations,
team names, league settings, member roles.

---

## 6. How sign-in works

**Supabase Auth handles it entirely.** The app never sees or stores a password;
it calls three functions in `src/features/auth/api.ts` — `signUp`, `signIn`,
`signOut` — and gets back a session token that the browser keeps and sends with
every request. Email and password only: no Google login, no magic links.

The bit that surprises people:

> **Registering grants nothing.** A new account has no league and no player, and
> sees an empty app until it joins.

Permission comes from a row in `league_members`, not from having an account.
There are two roles, `member` and `admin`.

### Who becomes the administrator

`dcastellotejera@gmail.com`, hardcoded in `app.owner_email()` (migration 008).
A database trigger watches for that exact address at sign-up and grants it
`admin`. Everyone else registers as nobody.

To hand admin to someone else, change their role in the app under Members —
the address in the code only decides the _first_ one, so the league can be
bootstrapped before anybody exists to configure it.

### How an account becomes a player

`players.user_id` is the link. It is empty for every player until someone claims
them — your 22 imported players all started that way.

A new arrival sees the join screen, which offers, in order:

1. **"That's me"** — pick yourself off the existing roster.
2. **Create a player** — for anyone the roster forgot.

Two people racing for the same player is settled by the database: the claim is a
conditional update that exactly one of them can win. The loser gets a clear
error instead of a silently shared account.

One account per player, one player per account, enforced by a unique index.
Deleting an account releases the player rather than deleting their scores.

### What a member can do

Edit their own name, nickname, position and photo — nothing else. That is not a
hidden button; it is two database functions (`update_own_player_profile`,
`set_own_player_avatar`) that name the editable fields explicitly, because RLS
can restrict rows but not columns. Everything else — creating matches, importing
results, league settings — is admin-only and enforced in the database, with a
pgTAP test for each rule.

Convocatorias are the one shared thing, and what decides who may touch one is
whether the match has been played (`public.match_is_upcoming`: status `draft` or
`scheduled`).

| Before it is played           | Member | Admin |
| ----------------------------- | ------ | ----- |
| Call themselves up            | ✅     | ✅    |
| Call anybody else up          | ❌     | ✅    |
| Remove somebody               | ❌     | ✅    |
| Move players, sides and bench | ✅     | ✅    |
| Change the formation          | ❌     | ✅    |
| Change how many play a side   | ❌     | ✅    |

Once it has been played nobody adds or removes anyone — an administrator
included, because the squad is the record of who turned up and the scores hang
off it. Only an administrator may still move players around, to correct where
people actually played. An administrator who really has to reopen a squad sets
the match back to `scheduled` first, which is a deliberate and visible act.

The column half of that table is a trigger (`app.guard_match_player_columns`),
not a policy, for the same reason as the profile functions above: a member's
UPDATE is restricted to `team_side` and `pitch_slot`, and RLS cannot say which
columns. Migration 011 and `tests/10_squad_self_service.sql`.

A `match_players` row _is_ the call-up: there is no attendance column. Migration
012 dropped the `attendance_status` enum it used to carry — called_up, confirmed,
played, absent — because eleven migrations in, nothing had ever read one. Whether
somebody played is answered by their score and their `pitch_slot`; somebody who
drops out is taken off the list.

---

## 7. Email confirmation

Newly on, locally. Production needs one switch in the dashboard.

### Locally

`config.toml` has `enable_confirmations = true`. No mail leaves your machine:
the stack captures everything at **http://127.0.0.1:54324** (Mailpit), where you
open the message and click the link yourself. The seeded owner arrives already
confirmed, so `make db-reset` still lets you straight in.

### In production — TODO

The frontend is up, at
<https://ultimate-pachanga.dcastellotejera.workers.dev/>, so the blocker is
gone: there is now a domain for a confirmation link to point at. Until these are
done the only production account is the owner's, created in the dashboard with
Auto Confirm, which never sent an email at all.

In this order:

- [ ] **Authentication → URL Configuration** → set **Site URL** to the Workers
      domain and add it under **Redirect URLs**.
- [ ] **Authentication → Sign In / Providers → Email** → turn on
      **Confirm email**.
- [ ] **Project Settings → Auth → SMTP Settings** → a real sender. See the
      warning below; without it most of the league never receives the email.
- [ ] **Authentication → Emails → Confirm signup** → paste
      [`templates/confirmation.html`](templates/confirmation.html) and its
      subject.

The order is the point. The confirmation link is _built from_ the Site URL, so
turning confirmation on first would mail everyone a link to a website that
exists only on your laptop — and they could not sign in until someone noticed.

Worth a glance before then: new Supabase projects ship with **Confirm email
already on** and Site URL set to a placeholder. Harmless while nobody else has
the URL, but it means the first person to register before this list is done gets
a dead link.

### ⚠️ The built-in email service will not carry a league

Supabase's default sender allows only a couple of messages an hour and is
explicitly for testing. With twenty people signing up the same evening, most
will never get their email.

Before sharing the URL, add a real sender under **Project Settings → Auth →
SMTP Settings**. [Resend](https://resend.com) is free for 3,000 messages a
month and takes about ten minutes: sign up, verify a domain (or use their test
one), paste host, port, user and API key. The rate limit itself is under
**Authentication → Rate Limits**.

### Customising the message

The Spanish version lives in [`templates/confirmation.html`](templates/confirmation.html)
and is wired into `config.toml`, so the local stack uses it as soon as you
`make db-stop && make db-start`.

**Production does not read that file** — it keeps its own copy, pasted into
Dashboard → **Authentication → Emails → Confirm signup** (the last item on the
TODO above). Keeping the two in step is manual, and the trade for not pushing
`config.toml` at production.

So edit the template here, check it locally in Mailpit, and paste it up when
there is a production worth pasting it to.

Variables you can use:

| Variable                 | Is                                           |
| ------------------------ | -------------------------------------------- |
| `{{ .ConfirmationURL }}` | The link. The one thing you must include     |
| `{{ .Token }}`           | Six-digit code, if you prefer codes to links |
| `{{ .Email }}`           | Their address                                |
| `{{ .SiteURL }}`         | The app's base URL                           |

Inline styles only — email clients throw away `<style>` blocks. The same screen
has templates for password reset, email change and invitations.

---

## 8. When something goes wrong

**"password authentication failed" but the password is right.**
Something ate a character. If it contains `$`, `@`, `/`, `#`, `?` or `%`,
percent-encode it (`$` → `%24`, `@` → `%40`).

**Sign-in fails with "Database error querying schema" after a reset.**
`make db-reset` replaces the auth container and the gateway keeps routing to the
old one. The Makefile restarts it for you; if you ran `npm run db:reset`
directly, `docker restart supabase_kong_ultimate-pachanga`.

**"failed to cache migrations catalog" during `db push`.**
Cosmetic. It appears _after_ the migrations apply and concerns a local diff
cache. `Finished supabase db push.` is the line that matters.

**A new account signs in and sees nothing.**
Working as designed — they have not claimed a player. They should be at
`/onboarding`.

**Nobody is receiving confirmation emails.**
The built-in sender's rate limit. See section 7.

**Check what production actually has:**

```bash
npx supabase migration list --db-url "$PROD_DB_URL"
```

Local and Remote columns should match.

---

## 9. Four things never to do

1. **`supabase db reset --linked`** — drops and recreates the _remote_ schema,
   taking the league's history with it. There is no undo. Local resets are
   `make db-reset`, which is a different command and perfectly safe.
2. **Edit a migration that has been pushed.** New file, next number.
3. **Put the database password, service-role key or secret key in a `VITE_`
   variable.** They would ship to every visitor's browser. Only the publishable
   key belongs in `.env.*.local`.
4. **Hand-edit `final_score`.** Re-import instead.
