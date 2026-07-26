-- ============================================================================
-- 014 — Formations for five, six and eight a side
--
-- A pachanga is whatever size turned up. Seven a side is the common case and
-- stays the default, but five, six and eight are all real, so the enum needs
-- the shapes to describe them.
--
-- The size of a formation is implied by its name: the lines are the outfield
-- players, and the goalkeeper is the one nobody writes down. `2-2` is four
-- outfielders plus a keeper, so it is five a side; `3-3-1` is eight. No two
-- shapes across the four sizes share a name, so the enum stays flat and
-- migration 015 derives the squad size by adding the name up.
--
-- Alone in its own migration on purpose: PostgreSQL will not let a value added
-- to an enum be *used* in the same transaction that added it, and 015 both
-- reads and writes these values.
-- ============================================================================

-- Five a side: four outfielders. Fútbol sala shapes.
alter type public.pitch_formation add value '2-2';
alter type public.pitch_formation add value '1-2-1';
alter type public.pitch_formation add value '3-1';

-- Six a side: five outfielders.
alter type public.pitch_formation add value '2-1-2';
alter type public.pitch_formation add value '3-2';
alter type public.pitch_formation add value '2-2-1';
alter type public.pitch_formation add value '1-3-1';

-- Seven a side already has '2-3-1', '3-3', '3-2-1' and '1-3-2' from 007.

-- Eight a side: seven outfielders.
alter type public.pitch_formation add value '3-3-1';
alter type public.pitch_formation add value '2-3-2';
alter type public.pitch_formation add value '3-2-2';
alter type public.pitch_formation add value '2-4-1';
