-- Best in costume: the organizer lists who is in costume (players, or guests who aren't playing),
-- and everyone at the party votes once for a woman and once for a man.

alter table table_versions drop constraint table_versions_name_check;
alter table table_versions add constraint table_versions_name_check
  check (name in ('players', 'results', 'pairs', 'matches', 'entrants', 'votes', 'picks'));
insert into table_versions (name) values ('entrants'), ('votes'), ('picks');

-- A player in costume, or a guest who isn't playing. A player's name and gender come from players.
create table costume_entrants (
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique references players (id) on delete cascade,
  guest text,
  guest_gender text check (guest_gender in ('F', 'M')),
  created_at timestamptz not null default now(),
  constraint costume_entrant_kind check (
    (player_id is not null and guest is null and guest_gender is null)
    or (player_id is null and length(trim(guest)) between 1 and 40 and guest_gender is not null)
  )
);

create unique index costume_guest_lower_idx on costume_entrants (lower(guest)) where guest is not null;

-- One vote per voter per award. A voter is a player or a guest from costume_entrants.
create table costume_votes (
  voter_player_id uuid references players (id) on delete cascade,
  voter_entrant_id uuid references costume_entrants (id) on delete cascade,
  gender text not null check (gender in ('F', 'M')),
  entrant_id uuid not null references costume_entrants (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint costume_vote_one_voter check (num_nonnulls(voter_player_id, voter_entrant_id) = 1)
);

create unique index costume_votes_once on costume_votes (coalesce(voter_player_id, voter_entrant_id), gender);

-- The organizer's choice when the most votes are tied.
create table costume_picks (
  gender text primary key check (gender in ('F', 'M')),
  entrant_id uuid not null references costume_entrants (id) on delete cascade
);

create trigger costume_entrants_bump_version after insert or update or delete on costume_entrants
for each statement execute function bump_table_version('entrants');
create trigger costume_votes_bump_version after insert or update or delete on costume_votes
for each statement execute function bump_table_version('votes');
create trigger costume_picks_bump_version after insert or update or delete on costume_picks
for each statement execute function bump_table_version('picks');

-- Casts a voter's picks for both awards at once. Either pick may be null when nobody is in that line-up.
create function cast_costume_votes(p_voter uuid, p_female uuid, p_male uuid)
returns void
language plpgsql
as $$
declare
  v_player uuid;
  v_guest uuid;
  v_name text;
  v_gender text;
  v_pick uuid;
  v_entrant costume_entrants%rowtype;
  v_entrant_gender text;
begin
  select id, name into v_player, v_name from players where id = p_voter;
  if v_player is null then
    select id, guest into v_guest, v_name from costume_entrants where id = p_voter and player_id is null;
  end if;
  if v_name is null then
    raise exception 'Your name isn’t on the list any more. Refresh and try again.';
  end if;
  if exists (select 1 from costume_votes where coalesce(voter_player_id, voter_entrant_id) = p_voter) then
    raise exception '% has already voted.', v_name;
  end if;
  if p_female is null and p_male is null then
    raise exception 'Pick who gets your vote.';
  end if;

  for v_gender, v_pick in
    select g, e from (values ('F', p_female), ('M', p_male)) as t (g, e) where e is not null
  loop
    select * into v_entrant from costume_entrants where id = v_pick;
    if not found then
      raise exception 'Someone you picked isn’t in the costume line-up any more. Refresh and pick again.';
    end if;
    v_entrant_gender := coalesce(v_entrant.guest_gender, (select gender from players where id = v_entrant.player_id));
    if v_entrant_gender <> v_gender then
      raise exception 'Pick a woman for the women’s award and a man for the men’s.';
    end if;
    if v_entrant.id = p_voter or v_entrant.player_id = p_voter then
      raise exception 'You can’t vote for yourself.';
    end if;
  end loop;

  insert into costume_votes (voter_player_id, voter_entrant_id, gender, entrant_id)
  select v_player, v_guest, g, e from (values ('F', p_female), ('M', p_male)) as t (g, e) where e is not null;
end;
$$;
