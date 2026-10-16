-- Best in costume voting stays closed until the organizer opens it, so the line-up is complete before
-- anyone votes: a vote can't be changed, so an early voter could never pick someone added later.

alter table table_versions drop constraint table_versions_name_check;
alter table table_versions add constraint table_versions_name_check
  check (name in ('players', 'results', 'pairs', 'matches', 'entrants', 'votes', 'picks', 'voting'));
insert into table_versions (name) values ('voting');

-- A single row. opened_at is null while voting is closed.
create table costume_voting (
  id boolean primary key default true check (id),
  opened_at timestamptz
);

insert into costume_voting default values;

create trigger costume_voting_bump_version after insert or update or delete on costume_voting
for each statement execute function bump_table_version('voting');

create function set_costume_voting(p_open boolean)
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
  update costume_voting set opened_at = case when p_open then coalesce(opened_at, now()) end;
end;
$$;

-- Same as 0005, plus the refusal while voting is closed.
create or replace function cast_costume_votes(p_voter uuid, p_female uuid, p_male uuid)
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
  if not exists (select 1 from costume_voting where opened_at is not null) then
    raise exception 'Voting isn’t open right now. Check back when the organizer opens it.';
  end if;

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
