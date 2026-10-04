-- Marks results created by the Teams tab's "Simulate 5 games" button, so they can be cleared
-- without touching results entered by hand.

alter table public.results add column simulated boolean not null default false;

create index results_simulated_idx on public.results (simulated) where simulated;
