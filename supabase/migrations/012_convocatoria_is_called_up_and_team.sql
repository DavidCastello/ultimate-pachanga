-- ============================================================================
-- 012 — A convocatoria is being called up, and a team
--
-- `match_players.attendance_status` is dropped, along with its enum. It carried
-- four states — called_up, confirmed, played, absent — and after eleven
-- migrations nothing has ever read one:
--
--   * no view uses it: player_cards, player_market_values and
--     player_metric_averages are built from player_match_scores
--   * import_match_scores does not consult it; it only requires that the player
--     is in the squad at all
--   * no ranking, statistic or screen displays it
--
-- It was written and never asked. The questions it looked like it answered are
-- already answered better by data that cannot drift out of step with reality:
--
--   Was somebody called up?   Their match_players row exists.
--   Which team?               team_side.
--   Did they play?            They have a score, and a pitch_slot rather than a
--                             place on the bench.
--   Did they not turn up?     An administrator takes them out of the
--                             convocatoria — which since 011 is the only way
--                             anybody leaves one.
--
-- Two sources of truth for "did this player turn out" is one too many, and the
-- one being maintained by hand in a dropdown is the one that goes stale. Keeping
-- a column against a future that may never come is exactly the speculation this
-- codebase avoids elsewhere.
--
-- Nothing depends on the column: 011 deliberately left it out of every policy,
-- so this is a plain drop rather than a rebuild.
-- ============================================================================

alter table public.match_players
  drop column attendance_status;

drop type public.attendance_status;

comment on table public.match_players is
  'The convocatoria: which players were called up for a match, which side they '
  'take and where they stand. A row is the call-up; there is no separate '
  'attendance flag.';
