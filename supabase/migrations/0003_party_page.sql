-- The public party page (reached from the QR code) shows the check-in list, team standings and
-- brackets to anyone without signing in. Visitors can read these; the only change they can make
-- is checking themselves in through check_in_player (granted in 0001). All writes stay organizer-only.

grant select on public.players, public.results, public.bracket_pairs, public.bracket_matches, public.player_stats to anon;

create policy "Anyone can read results" on public.results for select to anon using (true);
create policy "Anyone can read bracket pairs" on public.bracket_pairs for select to anon using (true);
create policy "Anyone can read bracket matches" on public.bracket_matches for select to anon using (true);
