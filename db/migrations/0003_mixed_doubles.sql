-- Mixed doubles, to save time: the women's and men's brackets now play one round of doubles, and the
-- four women and four men who win it are drawn at random into four mixed pairs (bracket 'X'). Mixed
-- doubles plays the semifinals, the final and the battle for 3rd.

-- The column named the gender; it now names the bracket.
alter table bracket_pairs rename column gender to bracket;
alter table bracket_matches rename column gender to bracket;

alter table bracket_pairs drop constraint bracket_pairs_gender_check;
alter table bracket_pairs add constraint bracket_pairs_bracket_check check (bracket in ('F', 'M', 'X'));
-- A mixed pair is a woman (player1) and a man (player2), who can be on different teams.
alter table bracket_pairs alter column team_id drop not null;
alter table bracket_pairs add constraint team_only_in_gender_brackets check ((bracket = 'X') = (team_id is null));

-- The women's and men's brackets no longer play a final or a battle for 3rd.
delete from bracket_matches where match in ('final', 'third');
alter table bracket_matches drop constraint bracket_matches_gender_check;
alter table bracket_matches add constraint bracket_matches_bracket_check check (bracket in ('F', 'M', 'X'));
alter table bracket_matches add constraint one_round_in_gender_brackets
  check (bracket = 'X' or match in ('semi1', 'semi2'));

-- The women and men whose pair won a first-round match: the players mixed doubles is drawn from.
-- Mirrors firstRoundWinners in src/domain/bracket.ts.
create view first_round_winners as
select p.bracket as gender, w.player_id
from bracket_matches m
join bracket_pairs p on p.bracket = m.bracket and p.slot = m.winner_slot
cross join lateral (values (p.player1_id), (p.player2_id)) as w(player_id)
where m.bracket in ('F', 'M');

drop function set_bracket_pairs(text, jsonb);
drop function set_match_winner(text, text, smallint);
drop function reset_bracket(text);

-- Replaces a bracket's four pairs (used for locking and for redrawing). p_pairs is a JSON array of
-- {slot, team_id, player1_id, player2_id}. Refused once any result is recorded in that bracket.
-- A women's or men's pair is two players from one team; a mixed pair is a woman and a man who won
-- their first-round match, with no team. Mirrors setBracketPairs in src/data/localRepo.ts.
create function set_bracket_pairs(p_bracket text, p_pairs jsonb)
returns void
language plpgsql
as $$
declare
  v_bad int;
begin
  if exists (select 1 from bracket_matches where bracket = p_bracket) then
    raise exception 'Results are already recorded in this bracket. Reset it to change the pairs.';
  end if;
  if jsonb_array_length(p_pairs) <> 4 then
    raise exception 'A bracket needs exactly 4 pairs.';
  end if;

  if p_bracket = 'X' then
    if (select count(*) from bracket_matches where bracket in ('F', 'M')) <> 4 then
      raise exception 'Finish the women’s and men’s first round before drawing mixed doubles.';
    end if;
    -- Each first-round winner plays in exactly one mixed pair, the woman as player1.
    select count(*) into v_bad
    from (
      select x.player1_id as player_id, 'F' as gender from jsonb_to_recordset(p_pairs) as x(player1_id uuid)
      union all
      select x.player2_id, 'M' from jsonb_to_recordset(p_pairs) as x(player2_id uuid)
    ) as picked
    full join first_round_winners w using (player_id, gender)
    where picked.player_id is null or w.player_id is null;
    if v_bad > 0 then
      raise exception 'Every mixed pair must be a woman and a man who won their first-round match.';
    end if;

    delete from bracket_pairs where bracket = 'X';
    insert into bracket_pairs (bracket, slot, team_id, player1_id, player2_id)
    select 'X', x.slot, null, x.player1_id, x.player2_id
    from jsonb_to_recordset(p_pairs) as x(slot smallint, player1_id uuid, player2_id uuid);
    return;
  end if;

  select count(*) into v_bad
  from jsonb_to_recordset(p_pairs) as x(slot smallint, team_id text, player1_id uuid, player2_id uuid)
  cross join lateral (values (x.player1_id), (x.player2_id)) as m(player_id)
  left join players p on p.id = m.player_id
  where p.id is null or p.team_id is distinct from x.team_id or p.gender <> p_bracket;
  if v_bad > 0 then
    raise exception 'Every pair must be two checked-in % players from the same team.',
      case p_bracket when 'F' then 'women' else 'men' end;
  end if;

  -- Minimum games to qualify. Mirrors MIN_PAIR_GAMES in src/domain/standings.ts.
  select count(*) into v_bad
  from jsonb_to_recordset(p_pairs) as x(player1_id uuid, player2_id uuid)
  cross join lateral (values (x.player1_id), (x.player2_id)) as m(player_id)
  where (select count(*) from results r where r.player_id = m.player_id) < 4;
  if v_bad > 0 then
    raise exception 'Every player in a pair needs at least 4 recorded games.';
  end if;

  delete from bracket_pairs where bracket = p_bracket;
  insert into bracket_pairs (bracket, slot, team_id, player1_id, player2_id)
  select p_bracket, x.slot, x.team_id, x.player1_id, x.player2_id
  from jsonb_to_recordset(p_pairs) as x(slot smallint, team_id text, player1_id uuid, player2_id uuid);
end;
$$;

-- Records (or clears, with null) the winner of a match. The women's and men's brackets only play
-- semi1 (slot 0 v 1) and semi2 (slot 2 v 3), and those results are fixed once mixed doubles is drawn
-- from them. In mixed doubles the final is the two semi winners and the battle for 3rd is the two
-- semi losers, and changing a semifinal drops a final or battle for 3rd whose winner is no longer in it.
-- Mirrors src/domain/bracket.ts applyWinner and setMatchWinner in src/data/localRepo.ts.
create function set_match_winner(p_bracket text, p_match text, p_winner_slot smallint)
returns void
language plpgsql
as $$
declare
  v_semi1 smallint;
  v_semi2 smallint;
begin
  if (select count(*) from bracket_pairs where bracket = p_bracket) <> 4 then
    raise exception 'Lock the pairs before recording results.';
  end if;
  if p_bracket <> 'X' then
    if p_match not in ('semi1', 'semi2') then
      raise exception 'The women’s and men’s brackets play one round. The final is in mixed doubles.';
    end if;
    if exists (select 1 from bracket_pairs where bracket = 'X') then
      raise exception 'Mixed doubles is already drawn from these results. Reset mixed doubles to change them.';
    end if;
  end if;

  if p_winner_slot is null then
    delete from bracket_matches where bracket = p_bracket and match = p_match;
  else
    if p_match = 'semi1' and p_winner_slot not in (0, 1)
       or p_match = 'semi2' and p_winner_slot not in (2, 3) then
      raise exception 'That pair is not in this match.';
    end if;
    if p_match in ('final', 'third') then
      select winner_slot into v_semi1 from bracket_matches where bracket = p_bracket and match = 'semi1';
      select winner_slot into v_semi2 from bracket_matches where bracket = p_bracket and match = 'semi2';
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
    insert into bracket_matches (bracket, match, winner_slot)
    values (p_bracket, p_match, p_winner_slot)
    on conflict (bracket, match) do update set winner_slot = excluded.winner_slot, decided_at = now();
  end if;

  if p_match in ('semi1', 'semi2') then
    select winner_slot into v_semi1 from bracket_matches where bracket = p_bracket and match = 'semi1';
    select winner_slot into v_semi2 from bracket_matches where bracket = p_bracket and match = 'semi2';
    delete from bracket_matches m
    where m.bracket = p_bracket
      and (
        m.match = 'final'
          and (v_semi1 is null or v_semi2 is null or m.winner_slot not in (v_semi1, v_semi2))
        or m.match = 'third'
          and (v_semi1 is null or v_semi2 is null or m.winner_slot not in (1 - v_semi1, 5 - v_semi2))
      );
  end if;
end;
$$;

-- Clears a bracket's pairs and results. Mixed doubles is drawn from the women's and men's brackets,
-- so it has to be reset before either of them.
create function reset_bracket(p_bracket text)
returns void
language plpgsql
as $$
begin
  if p_bracket <> 'X' and exists (select 1 from bracket_pairs where bracket = 'X') then
    raise exception 'Reset mixed doubles first. Its pairs come from this bracket.';
  end if;
  delete from bracket_matches where bracket = p_bracket;
  delete from bracket_pairs where bracket = p_bracket;
end;
$$;
