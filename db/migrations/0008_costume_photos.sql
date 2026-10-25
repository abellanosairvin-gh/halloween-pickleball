-- Best in costume photos: the organizer can photograph each person in the line-up, so everyone can still
-- see the costume after they change. One JPEG per entrant, already shrunk by the organizer's phone. A new
-- upload gets a new id, so a /api/photo?id= link always shows the same picture and can be cached for good.

create table costume_photos (
  entrant_id uuid primary key references costume_entrants (id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  data bytea not null check (octet_length(data) between 1 and 2000000),
  created_at timestamptz not null default now()
);

-- Adding, replacing or removing a photo changes the entrant's photo link, so it counts as a change to entrants.
create trigger costume_photos_bump_version after insert or update or delete on costume_photos
for each statement execute function bump_table_version('entrants');
