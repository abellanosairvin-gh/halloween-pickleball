-- The Teams tab no longer simulates games, so results are only ever entered with +W and +L.
drop index results_simulated_idx;
alter table results drop column simulated;
