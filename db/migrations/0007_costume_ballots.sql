-- Best in costume, after review:
--  * A ballot row records that someone voted, separately from their votes. Removing a person from the
--    line-up deletes the votes cast for them but keeps the voters' ballots, so guests (who only see
--    ballots) can't work out who voted for whom. The phone that cast a ballot holds its token and can
--    then fill in the award it lost, and only that award.
--  * Closing voting is remembered, so guests are told voting has closed rather than not opened yet.
--  * A guest entrant must have a name (a NULL slipped through the old CHECK).

alter table table_versions drop constraint table_versions_name_check;
alter table table_versions add constraint table_versions_name_check
  check (name in ('players', 'results', 'pairs', 'matches', 'entrants', 'votes', 'picks', 'voting', 'ballots'));
insert into table_versions (name) values ('ballots');

alter table costume_entrants drop constraint costume_entrant_kind;
alter table costume_entrants add constraint costume_entrant_kind check (
  (player_id is not null and guest is null and guest_gender is null)
  or (player_id is null and guest is not null and length(trim(guest)) between 1 and 40 and guest_gender is not null)
);

create table costume_ballots (
  voter_player_id uuid references players (id) on delete cascade,
  voter_entrant_id uuid references costume_entrants (id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint costume_ballot_one_voter check (num_nonnulls(voter_player_id, voter_entrant_id) = 1)
);

create unique index costume_ballots_once on costume_ballots (coalesce(voter_player_id, voter_entrant_id));

insert into costume_ballots (voter_player_id, voter_entrant_id, created_at)
select distinct on (coalesce(voter_player_id, voter_entrant_id)) voter_player_id, voter_entrant_id, created_at
from costume_votes
order by coalesce(voter_player_id, voter_entrant_id), created_at;

create trigger costume_ballots_bump_version after insert or update or delete on costume_ballots
for each statement execute function bump_table_version('ballots');

-- Voting is open while opened_at is set and closed_at isn't. Closing keeps opened_at.
alter table costume_voting add column closed_at timestamptz;

create or replace function set_costume_voting(p_open boolean)
returns void
language plpgsql
as $$
begin
  if p_open and exists (
    select 1 from (values ('F'), ('M')) as g (gender)
    where not exists (
      select 1 from costume_entrants e left join players p on p.id = e.player_id
      where coalesce(e.guest_gender, p.gender) = g.gender
    )
  ) then
    raise exception 'Add at least one woman and one man to the costume line-up before opening voting.';
  end if;
  update costume_voting set
    opened_at = case when p_open then coalesce(opened_at, now()) else opened_at end,
    closed_at = case when p_open or opened_at is null then null else coalesce(closed_at, now()) end;
end;
$$;

drop function cast_costume_votes(uuid, uuid, uuid);

-- Casts a ballot, or with its token fills in an award the ballot is missing. Returns the ballot's token.
create function cast_costume_votes(p_voter uuid, p_female uuid, p_male uuid, p_token uuid)
returns uuid
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
  v_token uuid;
begin
  if not exists (select 1 from costume_voting where opened_at is not null and closed_at is null) then
    raise exception 'Voting isn’t open right now. Check back when the organizer opens it.';
  end if;

  select id, name into v_player, v_name from players where id = p_voter;
  if v_player is null then
    select id, guest into v_guest, v_name from costume_entrants where id = p_voter and player_id is null;
  end if;
  if v_name is null then
    raise exception 'Your name isn’t on the list any more. Refresh and try again.';
  end if;
  if p_female is null and p_male is null then
    raise exception 'Pick who gets your vote.';
  end if;

  select token into v_token from costume_ballots where coalesce(voter_player_id, voter_entrant_id) = p_voter;
  if v_token is not null then
    -- Only the phone that cast this ballot can finish it, and only for an award it has no vote in.
    if p_token is distinct from v_token then
      raise exception '% has already voted.', v_name;
    end if;
    if exists (
      select 1 from costume_votes
      where coalesce(voter_player_id, voter_entrant_id) = p_voter
        and gender in (select g from (values ('F', p_female), ('M', p_male)) as t (g, e) where e is not null)
    ) then
      raise exception 'You’ve already voted for that award.';
    end if;
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

  if v_token is null then
    insert into costume_ballots (voter_player_id, voter_entrant_id) values (v_player, v_guest) returning token into v_token;
  end if;
  insert into costume_votes (voter_player_id, voter_entrant_id, gender, entrant_id)
  select v_player, v_guest, g, e from (values ('F', p_female), ('M', p_male)) as t (g, e) where e is not null;
  return v_token;
end;
$$;
