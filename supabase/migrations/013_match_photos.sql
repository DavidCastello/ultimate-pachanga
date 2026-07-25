-- ============================================================================
-- 013 — Match photographs
--
-- Every match shows a picture of the place it is played at. Until now that
-- picture was picked in the browser by matching the free-text location against
-- a handful of images bundled with the app, and that stays the default: a match
-- with no `photo_path` still gets the bundled photograph, so nothing already
-- created changes and creating a fixture never requires an upload.
--
-- Uploading one stores the object and points the match at it. There is
-- deliberately no `locations` table. The league plays wherever it can book a
-- pitch, the same place gets written three different ways, and what an
-- administrator actually wants afterwards is to fix *this match's* picture —
-- not to curate a catalogue of venues. A column on the match says exactly that
-- and nothing more.
--
-- Objects live at `{league_id}/{match_id}.{ext}`, matching the avatar layout
-- from 005 so the same league check authorizes them.
-- ============================================================================

alter table public.matches
  add column photo_path text
    check (photo_path is null or length(btrim(photo_path)) > 0);

comment on column public.matches.photo_path is
  'Object path in the match-photos bucket, or null to fall back to the '
  'photograph the app bundles for this location.';

-- ---------------------------------------------------------------------------
-- The bucket
--
-- Public, like player-avatars: these are photographs of a five-a-side pitch,
-- rendered by <img> tags on a page that already needs a login to reach, and a
-- signed URL per card would buy nothing.
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'match-photos',
  'match-photos',
  true,
  3145728, -- 3 MiB, the same ceiling the app enforces before uploading
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects
--
-- Administrators only, in step with `matches_insert_admins` and
-- `matches_update_admins`: whoever may create or correct a fixture may set its
-- photograph, and nobody else may. Update as well as insert, because replacing
-- a photograph upserts onto the existing object.
-- ---------------------------------------------------------------------------

create policy match_photos_read_all on storage.objects
  for select
  using (bucket_id = 'match-photos');

create policy match_photos_insert_admins on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'match-photos'
    and public.is_league_admin(app.league_id_from_object_name(name))
  );

create policy match_photos_update_admins on storage.objects
  for update to authenticated
  using (
    bucket_id = 'match-photos'
    and public.is_league_admin(app.league_id_from_object_name(name))
  )
  with check (
    bucket_id = 'match-photos'
    and public.is_league_admin(app.league_id_from_object_name(name))
  );

create policy match_photos_delete_admins on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'match-photos'
    and public.is_league_admin(app.league_id_from_object_name(name))
  );
