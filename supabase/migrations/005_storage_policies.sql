-- ============================================================================
-- 005 — Player avatar storage
--
-- Objects live at `{league_id}/{player_id}.{ext}`, so the first path segment
-- identifies the league and the policies below can authorize by it without a
-- lookup table.
--
-- Reads are public: avatars are rendered by <img> tags, and requiring a signed
-- URL per card would mean a round trip per player for no privacy gain — these
-- are photographs the players hand over themselves for a friends' league.
-- Writes are administrators only.
-- ============================================================================

-- A path whose first segment is not a UUID must fail the policy, not raise a
-- cast error. SQL does not promise to evaluate AND left-to-right, so guarding
-- the cast with a regex in the same expression would not be reliable.
create function app.league_id_from_object_name(p_name text) returns uuid
  language plpgsql immutable
  set search_path = ''
as $$
declare
  v_first_segment text := (storage.foldername(p_name))[1];
begin
  return v_first_segment::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

comment on function app.league_id_from_object_name is
  'Extracts the league id from an avatar object path, or null when the path '
  'does not start with a UUID segment.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'player-avatars',
  'player-avatars',
  true,
  3145728, -- 3 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects
--
-- A public bucket is readable over its public URL, but listing still goes
-- through RLS, hence the explicit select policy.
-- ---------------------------------------------------------------------------

create policy player_avatars_read_all on storage.objects
  for select
  using (bucket_id = 'player-avatars');

create policy player_avatars_insert_admins on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'player-avatars'
    and public.is_league_admin(app.league_id_from_object_name(name))
  );

create policy player_avatars_update_admins on storage.objects
  for update to authenticated
  using (
    bucket_id = 'player-avatars'
    and public.is_league_admin(app.league_id_from_object_name(name))
  )
  with check (
    bucket_id = 'player-avatars'
    and public.is_league_admin(app.league_id_from_object_name(name))
  );

create policy player_avatars_delete_admins on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'player-avatars'
    and public.is_league_admin(app.league_id_from_object_name(name))
  );
