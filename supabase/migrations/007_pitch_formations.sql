-- ============================================================================
-- 007 — Pitch formations
--
-- Every match, played or not, shows each squad laid out on a pitch. The
-- arrangement is persisted rather than computed on the fly: an administrator
-- drags players into the shape the teams actually took, and that has to survive
-- a reload or it was pointless work.
--
-- Fútbol 7, so seven players a side: a goalkeeper plus six outfielders. The
-- goalkeeper is implicit — always slot 0, always at the bottom of the pitch —
-- and the named formation describes the outfield lines only.
-- ============================================================================

create type public.pitch_formation as enum (
  '2-3-1',  -- default: two at the back, three across midfield, one up front
  '3-3',
  '3-2-1',
  '1-3-2'
);

alter table public.matches
  add column home_formation public.pitch_formation not null default '2-3-1',
  add column away_formation public.pitch_formation not null default '2-3-1';

-- ---------------------------------------------------------------------------
-- Slot assignment
--
-- 0 is the goalkeeper; 1..6 are the outfield slots, read left to right along
-- each line from the back. Null means the player is convocated but not placed:
-- the interface shows them on the bench.
--
-- The upper bound is 6 rather than the current formation's outfield count so
-- that switching formation never has to renumber anyone. Every supported
-- formation has exactly six outfield slots.
-- ---------------------------------------------------------------------------

alter table public.match_players
  add column pitch_slot smallint
    check (pitch_slot is null or pitch_slot between 0 and 6);

-- A slot holds at most one player per team. Partial so unplaced players, which
-- share a null slot, do not collide.
create unique index match_players_unique_pitch_slot
  on public.match_players (match_id, team_side, pitch_slot)
  where pitch_slot is not null;

comment on column public.match_players.pitch_slot is
  'Position within the team''s formation: 0 is the goalkeeper, 1-6 the outfield '
  'slots. Null means unplaced (on the bench).';

-- ---------------------------------------------------------------------------
-- Seed the existing squads into the default formation
--
-- Goalkeepers take slot 0 where the squad has one; everyone else is placed in
-- turn so the seeded matches show a full pitch immediately rather than an empty
-- one with everybody on the bench.
-- ---------------------------------------------------------------------------

with ranked as (
  select
    mp.id,
    row_number() over (
      partition by mp.match_id, mp.team_side
      -- Goalkeepers first so they land on slot 0, then a stable order.
      order by (p.preferred_position <> 'GK'), p.player_code
    ) - 1 as slot
  from public.match_players mp
  join public.players p on p.id = mp.player_id
  where mp.team_side in ('home', 'away')
)
update public.match_players mp
set pitch_slot = ranked.slot
from ranked
where ranked.id = mp.id
  and ranked.slot <= 6;
