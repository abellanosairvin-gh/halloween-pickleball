-- Irvin's Halloween Pickleball Party: schema, check-in logic and brackets.
-- The app reaches the database only through the API in api/, which decides who may do what:
-- anyone can read and check in, and everything else needs the organizer's session.

-- Teams ---------------------------------------------------------------------

create table teams (
  id text primary key,
  name text not null,
  sort_order smallint not null unique
);

insert into teams (id, name, sort_order) values
  ('pumpkin', 'Pumpkin', 1),
  ('witch', 'Witch', 2),
  ('skull', 'Skull', 3),
  ('bat', 'Bat', 4);

-- Players -------------------------------------------------------------------

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  gender text not null check (gender in ('F', 'M')),
  skill text not null check (skill in ('A', 'B')),
  checked_in_at timestamptz,
  team_id text references teams (id),
  created_at timestamptz not null default now(),
  constraint team_only_when_checked_in check ((checked_in_at is null) = (team_id is null)),
  constraint name_not_blank check (length(trim(name)) between 1 and 40)
);

-- "Sam" and "sam" are the same person on a check-in list.
create unique index players_name_lower_idx on players (lower(name));

-- Game results from the team phase (games run in another app; no scores) ----

create table results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  outcome text not null check (outcome in ('W', 'L')),
  created_at timestamptz not null default now(),
  -- Created by the Teams tab's "Simulate 5 games", so they can be cleared without touching real results.
  simulated boolean not null default false
);

create index results_player_idx on results (player_id, created_at desc);
create index results_simulated_idx on results (simulated) where simulated;

-- Tournament brackets (doubles, one fixed pair per team per gender) ----------

create table bracket_pairs (
  gender text not null check (gender in ('F', 'M')),
  slot smallint not null check (slot between 0 and 3),
  team_id text not null references teams (id),
  player1_id uuid not null references players (id),
  player2_id uuid not null references players (id),
  primary key (gender, slot),
  unique (gender, team_id),
  check (player1_id <> player2_id)
);

-- semi1 = slot 0 v slot 1, semi2 = slot 2 v slot 3, final = the two semi winners,
-- third (the battle for 3rd) = the two semi losers.
create table bracket_matches (
  gender text not null check (gender in ('F', 'M')),
  match text not null check (match in ('semi1', 'semi2', 'final', 'third')),
  winner_slot smallint not null check (winner_slot between 0 and 3),
  decided_at timestamptz not null default now(),
  primary key (gender, match)
);

-- A player in a locked pair keeps their gender and team until that bracket is reset.
-- (Deleting them is blocked by the bracket_pairs foreign keys.) Mirrors guardLocked in src/data/localRepo.ts.
create function guard_locked_pair_player()
returns trigger
language plpgsql
as $$
begin
  if (new.gender is distinct from old.gender or new.team_id is distinct from old.team_id)
     and exists (select 1 from bracket_pairs where old.id in (player1_id, player2_id)) then
    raise exception '% is in a locked tournament pair. Reset that bracket on the Tournament tab first.', old.name;
  end if;
  return new;
end;
$$;

create trigger players_guard_locked_pair
before update of gender, team_id on players
for each row execute function guard_locked_pair_player();

-- Change tracking ----------------------------------------------------------------
-- Every phone polls these counters and refetches only the tables whose number moved.

create table table_versions (
  name text primary key check (name in ('players', 'results', 'pairs', 'matches')),
  version bigint not null default 0
);

insert into table_versions (name) values ('players'), ('results'), ('pairs'), ('matches');

create function bump_table_version()
returns trigger
language plpgsql
as $$
begin
  update table_versions set version = version + 1 where name = tg_argv[0];
  return null;
end;
$$;

create trigger players_bump_version after insert or update or delete on players
for each statement execute function bump_table_version('players');
create trigger results_bump_version after insert or update or delete on results
for each statement execute function bump_table_version('results');
create trigger bracket_pairs_bump_version after insert or update or delete on bracket_pairs
for each statement execute function bump_table_version('pairs');
create trigger bracket_matches_bump_version after insert or update or delete on bracket_matches
for each statement execute function bump_table_version('matches');

-- Check-in ------------------------------------------------------------------
-- Assigns the team with the fewest checked-in players of the same gender and skill,
-- then the same gender, then fewest overall, then at random. Mirrors src/domain/assign.ts.

create function check_in_player(p_player_id uuid)
returns text
language plpgsql
as $$
declare
  v_player players%rowtype;
  v_team text;
begin
  -- Serialize concurrent check-ins so two arrivals can't both see the same counts.
  lock table players in share row exclusive mode;

  select * into v_player from players where id = p_player_id;
  if not found then
    raise exception 'That player isn’t on the list any more. Refresh and try again.';
  end if;
  if v_player.team_id is not null then
    return v_player.team_id;
  end if;

  select t.id into v_team
  from teams t
  left join players p on p.team_id = t.id
  group by t.id
  order by
    count(p.id) filter (where p.gender = v_player.gender and p.skill = v_player.skill),
    count(p.id) filter (where p.gender = v_player.gender),
    count(p.id),
    random()
  limit 1;

  update players set team_id = v_team, checked_in_at = now() where id = p_player_id;
  return v_team;
end;
$$;

-- Bracket operations -----------------------------------------------------------

-- Replaces a gender's four pairs (used for locking and for redrawing). p_pairs is a JSON array of
-- {slot, team_id, player1_id, player2_id}. Refused once any result is recorded in that bracket.
create function set_bracket_pairs(p_gender text, p_pairs jsonb)
returns void
language plpgsql
as $$
declare
  v_bad int;
begin
  if exists (select 1 from bracket_matches where gender = p_gender) then
    raise exception 'Results are already recorded in this bracket. Reset it to change the pairs.';
  end if;
  if jsonb_array_length(p_pairs) <> 4 then
    raise exception 'A bracket needs exactly 4 pairs.';
  end if;

  select count(*) into v_bad
  from jsonb_to_recordset(p_pairs) as x(slot smallint, team_id text, player1_id uuid, player2_id uuid)
  cross join lateral (values (x.player1_id), (x.player2_id)) as m(player_id)
  left join players p on p.id = m.player_id
  where p.id is null or p.team_id is distinct from x.team_id or p.gender <> p_gender;
  if v_bad > 0 then
    raise exception 'Every pair must be two checked-in % players from the same team.',
      case p_gender when 'F' then 'women' else 'men' end;
  end if;

  -- Minimum games to qualify. Mirrors MIN_PAIR_GAMES in src/domain/standings.ts.
  select count(*) into v_bad
  from jsonb_to_recordset(p_pairs) as x(player1_id uuid, player2_id uuid)
  cross join lateral (values (x.player1_id), (x.player2_id)) as m(player_id)
  where (select count(*) from results r where r.player_id = m.player_id) < 4;
  if v_bad > 0 then
    raise exception 'Every player in a pair needs at least 4 recorded games.';
  end if;

  delete from bracket_pairs where gender = p_gender;
  insert into bracket_pairs (gender, slot, team_id, player1_id, player2_id)
  select p_gender, x.slot, x.team_id, x.player1_id, x.player2_id
  from jsonb_to_recordset(p_pairs) as x(slot smallint, team_id text, player1_id uuid, player2_id uuid);
end;
$$;

-- Records (or clears, with null) the winner of a match. The final is the two semi winners and the
-- battle for 3rd is the two semi losers (semi1 is slot 0 v 1, semi2 is slot 2 v 3). Changing a
-- semifinal drops a final or battle for 3rd whose winner is no longer in it.
-- Mirrors src/domain/bracket.ts applyWinner.
create function set_match_winner(p_gender text, p_match text, p_winner_slot smallint)
returns void
language plpgsql
as $$
declare
  v_semi1 smallint;
  v_semi2 smallint;
begin
  if (select count(*) from bracket_pairs where gender = p_gender) <> 4 then
    raise exception 'Lock the pairs before recording results.';
  end if;

  if p_winner_slot is null then
    delete from bracket_matches where gender = p_gender and match = p_match;
  else
    if p_match = 'semi1' and p_winner_slot not in (0, 1)
       or p_match = 'semi2' and p_winner_slot not in (2, 3) then
      raise exception 'That pair is not in this match.';
    end if;
    if p_match in ('final', 'third') then
      select winner_slot into v_semi1 from bracket_matches where gender = p_gender and match = 'semi1';
      select winner_slot into v_semi2 from bracket_matches where gender = p_gender and match = 'semi2';
      if v_semi1 is null or v_semi2 is null then
        raise exception 'Finish both semifinals first.';
      end if;
      if p_match = 'final' and p_winner_slot not in (v_semi1, v_semi2) then
        raise exception 'That pair is not in the final.';
      end if;
      if p_match = 'third' and p_winner_slot not in (1 - v_semi1, 5 - v_semi2) then
        raise exception 'That pair is not in the battle for 3rd.';
      end if;
    end if;
    insert into bracket_matches (gender, match, winner_slot)
    values (p_gender, p_match, p_winner_slot)
    on conflict (gender, match) do update set winner_slot = excluded.winner_slot, decided_at = now();
  end if;

  if p_match in ('semi1', 'semi2') then
    select winner_slot into v_semi1 from bracket_matches where gender = p_gender and match = 'semi1';
    select winner_slot into v_semi2 from bracket_matches where gender = p_gender and match = 'semi2';
    delete from bracket_matches m
    where m.gender = p_gender
      and (
        m.match = 'final'
          and (v_semi1 is null or v_semi2 is null or m.winner_slot not in (v_semi1, v_semi2))
        or m.match = 'third'
          and (v_semi1 is null or v_semi2 is null or m.winner_slot not in (1 - v_semi1, 5 - v_semi2))
      );
  end if;
end;
$$;

create function reset_bracket(p_gender text)
returns void
language sql
as $$
  delete from bracket_matches where gender = p_gender;
  delete from bracket_pairs where gender = p_gender;
$$;
