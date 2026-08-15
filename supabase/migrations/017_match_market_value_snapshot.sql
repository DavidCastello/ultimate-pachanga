-- ============================================================================
-- 017 — What each side was worth
--
-- A match page can add up the market values of the two line-ups and show
-- whether the split was fair. For a fixture still to be played that sum is
-- simply today's figures. For one already played it cannot be, because every
-- valuation in the league moves the moment the results are imported — the very
-- match being audited is what moved them. Recomputed later, a perfectly even
-- split reads as lopsided, and nothing on the screen explains why.
--
-- So the value each player carried *into* a match is frozen onto their
-- convocatoria row the first time the match is scored. Reading it back is then
-- a sum, not a reconstruction.
-- ============================================================================

alter table public.match_players
  add column market_value_gbp numeric(14, 2);

comment on column public.match_players.market_value_gbp is
  'What the player was worth going into this match, frozen when it was first '
  'scored. Null for a match not yet played, and for the fixtures that were '
  'already in the books when this column arrived.';

-- ---------------------------------------------------------------------------
-- The freeze
--
-- Three things about the timing, each of which is the reason for a keyword:
--
--   before insert, not after. import_match_scores writes every score and only
--   then flips matches.status, so a trigger hung off the status change would
--   read a league this match had already revalued. Ahead of the first score
--   landing, player_market_values still describes the league as it was at
--   kickoff.
--
--   The first row freezes the whole squad, bench included. Rows two onwards
--   find nothing left to set and do nothing. Whether somebody actually played
--   is pitch_slot's business, it can still be corrected after the import, and
--   the value should not have to be recovered when it is.
--
--   `is null` is what makes a re-import safe. Correcting a scorecard must not
--   re-freeze the squad at the values this match itself produced.
--
-- security definer because player_market_values is security_invoker: run as
-- the caller, the update would silently cover only the rows their own grants
-- reach, and a half-frozen squad sums to a number that is wrong without
-- looking wrong.
-- ---------------------------------------------------------------------------

create function app.freeze_match_market_values() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.match_players mp
  set market_value_gbp = mv.market_value_gbp
  from public.player_market_values mv
  where mp.match_id = new.match_id
    and mv.player_id = mp.player_id
    and mp.market_value_gbp is null;

  return new;
end;
$$;

comment on function app.freeze_match_market_values is
  'Records what every player called up for a match was worth immediately '
  'before its first score was written.';

create trigger player_match_scores_freeze_market_values
  before insert on public.player_match_scores
  for each row execute function app.freeze_match_market_values();

-- ---------------------------------------------------------------------------
-- And nobody else writes it
--
-- match_players_arrange_members (011) lets any member update a row of an
-- upcoming match, because sorting the teams out on the pitch is everybody's
-- job. RLS cannot restrict that to particular columns, which is why
-- guard_match_player_columns exists — and the new column has to join the list
-- it protects. Otherwise the figure the match page presents as an audit of the
-- split is writable by anyone looking at it.
--
-- Same shape as 011, with one more thing a member may not touch.
-- ---------------------------------------------------------------------------

create or replace function app.guard_match_player_columns() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null
     or public.is_league_admin(public.match_league_id(old.match_id))
  then
    return new;
  end if;

  if new.match_id <> old.match_id or new.player_id <> old.player_id then
    raise exception 'Only an administrator can change who is called up'
      using errcode = 'insufficient_privilege';
  end if;

  if new.market_value_gbp is distinct from old.market_value_gbp then
    raise exception 'What a player was worth is not yours to change'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function app.guard_match_player_columns is
  'Restricts a member''s UPDATE on match_players to team_side and pitch_slot. '
  'The row-level half of the rule lives in match_players_arrange_members.';
