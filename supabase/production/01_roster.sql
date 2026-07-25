-- ============================================================================
-- Production — 01 Roster
--
-- The twenty-two real players of the Liga de verano roco, transcribed from the
-- league spreadsheet. Run once against the deployed database; see README.md in
-- this directory for the order and the connection.
--
-- Not a migration on purpose. Migrations run on every `supabase db reset`, and
-- this data would then collide with supabase/seed.sql on every developer's
-- machine. Reference data belongs in migrations; a league's actual roster does
-- not.
--
-- Re-runnable: matching on (league_id, player_code) it corrects names and
-- positions rather than inserting twice, and never touches `user_id`,
-- `avatar_path` or `is_active` — a player who has already claimed their account
-- or uploaded a photograph must survive a second run untouched.
--
-- ---------------------------------------------------------------------------
-- How the spreadsheet columns map onto the schema
--
--   «Mote»                -> player_code    the code typed into result CSVs
--   «Nombre y Apellidos»  -> first_name + last_name, split on the last word
--
-- The spreadsheet's «Mote» is the person's real name and «Nombre y Apellidos»
-- is the footballer they have adopted; the card shows the latter, which is the
-- whole point of the cards. Codes are the mote uppercased with spaces turned
-- into hyphens (`DAVID C` -> `DAVID-C`) to satisfy the player_code format, and
-- they stay short and memorable because a human types them into a spreadsheet
-- after every match.
--
-- Three aliases are a single word, and last_name is NOT NULL. Those three carry
-- a `nickname` so the card still reads exactly as the spreadsheet does; their
-- first/last split exists only to satisfy the column and is marked below.
--
-- ---------------------------------------------------------------------------
-- Positions are a guess
--
-- The spreadsheet records no position, so `preferred_position` is inferred from
-- the footballer each player has named themselves after — Oblak in goal,
-- Chiellini at the back, Van Nistelrooy up front. Nothing depends on it being
-- right: it decides the initial arrangement on the pitch (02_fixtures.sql) and
-- the label on the card, both of which an administrator can change in the app.
-- Correct any of them here or in the players table directly.
-- ============================================================================

begin;

insert into public.players (
  league_id, player_code, first_name, last_name, nickname, preferred_position
)
values
  (app.initial_league_id(), 'JORDI',    'Giorgio',          'Chellini',      null,           'CB'),
  (app.initial_league_id(), 'JOSE',     'Jose',             'Mourinho',      null,           'UT'),
  (app.initial_league_id(), 'PAU-R',    'Pau',              'Cubarsi',       null,           'CB'),
  (app.initial_league_id(), 'ALEX',     'Alejandro "Caño"', 'Ibagaza',       null,           'CAM'),
  (app.initial_league_id(), 'SERGIO-M', 'Sergio',           'Busquets',      null,           'CDM'),
  (app.initial_league_id(), 'JOSEP-M',  'Josep',            'Guardiola',     null,           'CDM'),
  (app.initial_league_id(), 'JOAN',     'Joanito',          'Williams',      null,           'LW'),
  -- One-word alias: nickname carries it, first/last only satisfy the column.
  (app.initial_league_id(), 'PEP-M',    'Pepe',             'Pep',           'Pepe',         'CB'),
  (app.initial_league_id(), 'RAUL',     'Raul Gonzalez',    'Blanco',        null,           'ST'),
  (app.initial_league_id(), 'DAVID-C',  'David',            'Villa',         null,           'ST'),
  (app.initial_league_id(), 'KIRILL',   'Mikel',            'Cirilo',        null,           'UT'),
  (app.initial_league_id(), 'DAVID-W',  'Daviñaqui',        'Williams',      null,           'ST'),
  (app.initial_league_id(), 'LLUIS',    'Luis',             'Iniesta',       null,           'CM'),
  (app.initial_league_id(), 'JAN-M',    'Jan',              'Oblak',         null,           'GK'),
  (app.initial_league_id(), 'PERICO',   'Perico',           'Van Nistelroy', null,           'ST'),
  (app.initial_league_id(), 'RODRI',    'R9',               '"O fenomeno"',  null,           'ST'),
  (app.initial_league_id(), 'SERGI-P',  'Sergio',           'Ramos',         null,           'CB'),
  -- One-word alias.
  (app.initial_league_id(), 'JOSEP-P',  'Guti',             'Josep',         'Guti',         'CAM'),
  (app.initial_league_id(), 'ALEIX',    'Aleixus',          'Sanchez',       null,           'LW'),
  -- One-word alias.
  (app.initial_league_id(), 'MARC',     'Marcradona',       'Marc',          'Marcradona',   'CAM'),
  (app.initial_league_id(), 'ANDREU',   'Andrew',           'Ventura',       null,           'GK'),
  (app.initial_league_id(), 'CARLOS',   'Roberto',          'Carlos',        null,           'LB')
on conflict (league_id, player_code) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      nickname = excluded.nickname,
      preferred_position = excluded.preferred_position;

-- Fail rather than leave a half-loaded roster behind: everything downstream
-- resolves players by code, and a missing one would surface much later as a
-- confusing import error.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.players
  where league_id = app.initial_league_id()
    and player_code in (
      'JORDI', 'JOSE', 'PAU-R', 'ALEX', 'SERGIO-M', 'JOSEP-M', 'JOAN',
      'PEP-M', 'RAUL', 'DAVID-C', 'KIRILL', 'DAVID-W', 'LLUIS', 'JAN-M',
      'PERICO', 'RODRI', 'SERGI-P', 'JOSEP-P', 'ALEIX', 'MARC', 'ANDREU',
      'CARLOS'
    );

  if v_count <> 22 then
    raise exception 'Expected 22 players in the roster, found %', v_count;
  end if;

  raise notice 'Roster loaded: 22 players.';
end;
$$;

commit;
