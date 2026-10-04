-- Adds the battle for 3rd: the two semifinal losers play for 3rd and 4th place, so each bracket
-- ends with a full podium. set_match_winner is replaced in place, which keeps its grants from 0001.

alter table public.bracket_matches drop constraint bracket_matches_match_check;
alter table public.bracket_matches
  add constraint bracket_matches_match_check check (match in ('semi1', 'semi2', 'final', 'third'));

-- Records (or clears, with null) the winner of a match. The final is the two semi winners and the
-- battle for 3rd is the two semi losers (semi1 is slot 0 v 1, semi2 is slot 2 v 3). Changing a
-- semifinal drops a final or battle for 3rd whose winner is no longer in it.
-- Mirrors src/domain/bracket.ts applyWinner.
create or replace function public.set_match_winner(p_gender text, p_match text, p_winner_slot smallint)
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
    if p_match in ('final', 'third') then
      select winner_slot into v_semi1 from public.bracket_matches where gender = p_gender and match = 'semi1';
      select winner_slot into v_semi2 from public.bracket_matches where gender = p_gender and match = 'semi2';
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
    insert into public.bracket_matches (gender, match, winner_slot)
    values (p_gender, p_match, p_winner_slot)
    on conflict (gender, match) do update set winner_slot = excluded.winner_slot, decided_at = now();
  end if;

  if p_match in ('semi1', 'semi2') then
    select winner_slot into v_semi1 from public.bracket_matches where gender = p_gender and match = 'semi1';
    select winner_slot into v_semi2 from public.bracket_matches where gender = p_gender and match = 'semi2';
    delete from public.bracket_matches m
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
