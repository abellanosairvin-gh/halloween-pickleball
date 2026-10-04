-- Irvin's Halloween Pickleball Party: schema, check-in logic, brackets and access rules.

-- Teams ---------------------------------------------------------------------

create table public.teams (
  id text primary key,
  name text not null,
  sort_order smallint not null unique
);

insert into public.teams (id, name, sort_order) values
  ('pumpkin', 'Pumpkin', 1),
  ('witch', 'Witch', 2),
  ('skull', 'Skull', 3),
  ('bat', 'Bat', 4);

-- Players -------------------------------------------------------------------

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  gender text not null check (gender in ('F', 'M')),
  skill text not null check (skill in ('A', 'B')),
  checked_in_at timestamptz,
  team_id text references public.teams (id),
  created_at timestamptz not null default now(),
  constraint team_only_when_checked_in check ((checked_in_at is null) = (team_id is null)),
  constraint name_not_blank check (length(trim(name)) between 1 and 40)
);

-- "Sam" and "sam" are the same person on a check-in list.
create unique index players_name_lower_idx on public.players (lower(name));

-- Game results from the team phase (games run in another app; no scores) ----

create table public.results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  outcome text not null check (outcome in ('W', 'L')),
  created_at timestamptz not null default now()
);

create index results_player_idx on public.results (player_id, created_at desc);

create view public.player_stats with (security_invoker = true) as
select
  p.id as player_id,
  count(r.id) filter (where r.outcome = 'W') as wins,
  count(r.id) filter (where r.outcome = 'L') as losses,
  count(r.id) as games,
  case when count(r.id) = 0 then null
       else round(count(r.id) filter (where r.outcome = 'W')::numeric / count(r.id), 4) end as win_rate
from public.players p
left join public.results r on r.player_id = p.id
group by p.id;

-- Tournament brackets (doubles, one fixed pair per team per gender) ----------

create table public.bracket_pairs (
  gender text not null check (gender in ('F', 'M')),
  slot smallint not null check (slot between 0 and 3),
  team_id text not null references public.teams (id),
  player1_id uuid not null references public.players (id),
  player2_id uuid not null references public.players (id),
  primary key (gender, slot),
  unique (gender, team_id),
  check (player1_id <> player2_id)
);

-- semi1 = slot 0 v slot 1, semi2 = slot 2 v slot 3, final = the two semi winners.
create table public.bracket_matches (
  gender text not null check (gender in ('F', 'M')),
  match text not null check (match in ('semi1', 'semi2', 'final')),
  winner_slot smallint not null check (winner_slot between 0 and 3),
  decided_at timestamptz not null default now(),
  primary key (gender, match)
);

-- A player in a locked pair keeps their gender and team until that bracket is reset.
-- (Deleting them is blocked by the bracket_pairs foreign keys.) Mirrors guardLocked in src/data/localRepo.ts.
create function public.guard_locked_pair_player()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.gender is distinct from old.gender or new.team_id is distinct from old.team_id)
     and exists (select 1 from public.bracket_pairs where old.id in (player1_id, player2_id)) then
    raise exception '% is in a locked tournament pair. Reset that bracket on the Tournament tab first.', old.name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger players_guard_locked_pair
before update of gender, team_id on public.players
for each row execute function public.guard_locked_pair_player();

-- Check-in ------------------------------------------------------------------
-- Assigns the team with the fewest checked-in players of the same gender and skill,
-- then the same gender, then fewest overall, then at random. Mirrors src/domain/assign.ts.
-- Security definer so the future anonymous QR page can call it without write access.

create function public.check_in_player(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_team text;
begin
  -- Serialize concurrent check-ins so two arrivals can't both see the same counts.
  lock table public.players in share row exclusive mode;

  select * into v_player from public.players where id = p_player_id;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if v_player.team_id is not null then
    return v_player.team_id;
  end if;

  select t.id into v_team
  from public.teams t
  left join public.players p on p.team_id = t.id
  group by t.id
  order by
    count(p.id) filter (where p.gender = v_player.gender and p.skill = v_player.skill),
    count(p.id) filter (where p.gender = v_player.gender),
    count(p.id),
    random()
  limit 1;

  update public.players set team_id = v_team, checked_in_at = now() where id = p_player_id;
  return v_team;
end;
$$;

-- Bracket operations -----------------------------------------------------------

-- Replaces a gender's four pairs (used for locking and for redrawing). p_pairs is a JSON array of
-- {slot, team_id, player1_id, player2_id}. Refused once any result is recorded in that bracket.
create function public.set_bracket_pairs(p_gender text, p_pairs jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_bad int;
begin
  if exists (select 1 from public.bracket_matches where gender = p_gender) then
    raise exception 'Results are already recorded in this bracket. Reset it to change the pairs.';
  end if;
  if jsonb_array_length(p_pairs) <> 4 then
    raise exception 'A bracket needs exactly 4 pairs.';
  end if;

  select count(*) into v_bad
  from jsonb_to_recordset(p_pairs) as x(slot smallint, team_id text, player1_id uuid, player2_id uuid)
  cross join lateral (values (x.player1_id), (x.player2_id)) as m(player_id)
  left join public.players p on p.id = m.player_id
  where p.id is null or p.team_id is distinct from x.team_id or p.gender <> p_gender;
  if v_bad > 0 then
    raise exception 'Every pair must be two checked-in % players from the same team.',
      case p_gender when 'F' then 'women' else 'men' end;
  end if;

  -- Minimum games to qualify. Mirrors MIN_PAIR_GAMES in src/domain/standings.ts.
  select count(*) into v_bad
  from jsonb_to_recordset(p_pairs) as x(player1_id uuid, player2_id uuid)
  cross join lateral (values (x.player1_id), (x.player2_id)) as m(player_id)
  where (select count(*) from public.results r where r.player_id = m.player_id) < 4;
  if v_bad > 0 then
    raise exception 'Every player in a pair needs at least 4 recorded games.';
  end if;

  delete from public.bracket_pairs where gender = p_gender;
  insert into public.bracket_pairs (gender, slot, team_id, player1_id, player2_id)
  select p_gender, x.slot, x.team_id, x.player1_id, x.player2_id
  from jsonb_to_recordset(p_pairs) as x(slot smallint, team_id text, player1_id uuid, player2_id uuid);
end;
$$;

-- Records (or clears, with null) the winner of a match. Changing a semifinal drops a final
-- result that no longer involves that semi's winner. Mirrors src/domain/bracket.ts applyWinner.
create function public.set_match_winner(p_gender text, p_match text, p_winner_slot smallint)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_semi1 smallint;
  v_semi2 smallint;
begin
  if (select count(*) from public.bracket_pairs where gender = p_gender) <> 4 then
    raise exception 'Lock the pairs before recording results.';
  end if;

  if p_winner_slot is null then
    delete from public.bracket_matches where gender = p_gender and match = p_match;
  else
    if p_match = 'semi1' and p_winner_slot not in (0, 1)
       or p_match = 'semi2' and p_winner_slot not in (2, 3) then
      raise exception 'That pair is not in this match.';
    end if;
    if p_match = 'final' then
      select winner_slot into v_semi1 from public.bracket_matches where gender = p_gender and match = 'semi1';
      select winner_slot into v_semi2 from public.bracket_matches where gender = p_gender and match = 'semi2';
      if v_semi1 is null or v_semi2 is null then
        raise exception 'Finish both semifinals before the final.';
      end if;
      if p_winner_slot not in (v_semi1, v_semi2) then
        raise exception 'That pair is not in the final.';
      end if;
    end if;
    insert into public.bracket_matches (gender, match, winner_slot)
    values (p_gender, p_match, p_winner_slot)
    on conflict (gender, match) do update set winner_slot = excluded.winner_slot, decided_at = now();
  end if;

  if p_match <> 'final' then
    delete from public.bracket_matches f
    where f.gender = p_gender and f.match = 'final'
      and (
        (select count(*) from public.bracket_matches s where s.gender = p_gender and s.match <> 'final') < 2
        or f.winner_slot not in (select s.winner_slot from public.bracket_matches s where s.gender = p_gender and s.match <> 'final')
      );
  end if;
end;
$$;

create function public.reset_bracket(p_gender text)
returns void
language sql
set search_path = public
as $$
  delete from public.bracket_matches where gender = p_gender;
  delete from public.bracket_pairs where gender = p_gender;
$$;

-- Access rules -----------------------------------------------------------------
-- Signed-in users are organizers and can do everything. Anonymous visitors (the future QR page)
-- can list names and check themselves in, nothing else.

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.results enable row level security;
alter table public.bracket_pairs enable row level security;
alter table public.bracket_matches enable row level security;

create policy "Anyone can read teams" on public.teams for select to anon, authenticated using (true);

create policy "Organizers manage players" on public.players for all to authenticated using (true) with check (true);
create policy "Anyone can list players" on public.players for select to anon using (true);

create policy "Organizers manage results" on public.results for all to authenticated using (true) with check (true);
create policy "Organizers manage bracket pairs" on public.bracket_pairs for all to authenticated using (true) with check (true);
create policy "Organizers manage bracket matches" on public.bracket_matches for all to authenticated using (true) with check (true);

-- Anonymous visitors only see the columns the check-in page needs.
revoke all on public.players from anon;
grant select (id, name, team_id, checked_in_at) on public.players to anon;
revoke all on public.results, public.bracket_pairs, public.bracket_matches, public.player_stats from anon;

revoke execute on function public.check_in_player(uuid) from public;
grant execute on function public.check_in_player(uuid) to anon, authenticated;

revoke execute on function public.set_bracket_pairs(text, jsonb) from public, anon;
revoke execute on function public.set_match_winner(text, text, smallint) from public, anon;
revoke execute on function public.reset_bracket(text) from public, anon;
grant execute on function public.set_bracket_pairs(text, jsonb) to authenticated;
grant execute on function public.set_match_winner(text, text, smallint) to authenticated;
grant execute on function public.reset_bracket(text) to authenticated;

-- Realtime ----------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.players, public.results, public.bracket_pairs, public.bracket_matches;
  end if;
end;
$$;
