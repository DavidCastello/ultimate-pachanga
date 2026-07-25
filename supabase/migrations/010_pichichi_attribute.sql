-- ============================================================================
-- 010 — Pichichi
--
-- The league's sixth award: top scorer, worth the same two points as the rest
-- of the positive ones.
--
-- Attributes are per-league reference data, and there is no screen for editing
-- them, so adding one is a migration. 001 seeded the original five for the
-- initial league; this adds to that set rather than editing it, because an
-- applied migration is never rewritten.
--
-- Nothing else has to change for it to work end to end: the CSV parser
-- resolves attribute names against whatever the league has active, and
-- import_match_scores validates against the same set. Typing `Pichichi` in the
-- Atributos column starts working the moment this lands.
-- ============================================================================

insert into public.league_attributes (league_id, code, label, points)
values (app.initial_league_id(), 'pichichi', 'Pichichi', 2)
on conflict (league_id, code) do update
  set label = excluded.label,
      points = excluded.points,
      is_active = true;
