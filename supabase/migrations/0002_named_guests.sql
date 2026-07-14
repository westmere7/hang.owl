-- Named guests: let the organizer pre-create members (by name only) before
-- anyone scans the QR, so spends can be assigned/billed to them right away.
-- A "placeholder" member is a row with profile_id = NULL. When that person
-- later scans the QR, they claim the placeholder (profile_id := their uid).

-- Placeholders have no auth user yet.
alter table public.hangout_members alter column profile_id drop not null;

-- The admin can insert members for their own hangout (named placeholders,
-- and their own admin row at creation time).
create policy "members admin insert" on public.hangout_members
  for insert to authenticated
  with check (is_hangout_admin(hangout_id));

-- A signed-in guest can claim an unclaimed placeholder seat as themselves.
-- (Member ids are unguessable UUIDs surfaced only via the hangout's code.)
create policy "members claim placeholder" on public.hangout_members
  for update to authenticated
  using (profile_id is null)
  with check (profile_id = auth.uid());
