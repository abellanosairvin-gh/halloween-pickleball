-- A small copy of each costume photo for the vote cards, the gallery and the organizer's list, so guests'
-- phones load the full-size photo only when someone opens it. Photos saved before this have none and fall
-- back to the full-size one.

alter table costume_photos
  add column thumb bytea check (thumb is null or octet_length(thumb) between 1 and 300000);
