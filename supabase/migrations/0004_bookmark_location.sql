-- Optional location for bookmarks (an address, place name, or a maps link).
-- When set, the card shows a pin that opens it in Google Maps.
alter table public.bookmarks add column if not exists location text;
alter table public.hangout_bookmarks add column if not exists location text;
