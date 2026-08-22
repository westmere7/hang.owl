-- 0005: Lock down the read/join surface and make bill photos private.
--
-- Before this, every visitor gets an anonymous (but "authenticated") session,
-- and the read policies were `using (true)` — so anyone could list every
-- hangout (with its invite code), join it, and read all spends + bill photos.
-- Membership is now required to read hangout data; the QR join flow reads a
-- hangout by its (secret) code through a SECURITY DEFINER function instead.

-- profiles: only your own row. Display names are denormalised onto members,
-- so nothing needs to read other people's profile rows directly.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (id = auth.uid());

-- hangouts: members/admin only. (Non-members lookup by code via the function.)
drop policy if exists "hangouts read" on public.hangouts;
create policy "hangouts read" on public.hangouts
  for select to authenticated
  using (is_hangout_member(id) or admin_id = auth.uid());

-- members: only readable from within a hangout you belong to.
drop policy if exists "members read" on public.hangout_members;
create policy "members read" on public.hangout_members
  for select to authenticated
  using (is_hangout_member(hangout_id) or is_hangout_admin(hangout_id));

-- Join-by-code: returns one hangout + its members for a known code, bypassing
-- the member-only read policy. You must already know the (unguessable) code,
-- which now only reaches you via the QR / invite link — it can no longer be
-- enumerated from the hangouts table.
create or replace function public.get_hangout_by_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(h) || jsonb_build_object(
    'hangout_members',
    coalesce(
      (
        select jsonb_agg(to_jsonb(m) order by m.joined_at)
        from hangout_members m
        where m.hangout_id = h.id
      ),
      '[]'::jsonb
    )
  )
  from hangouts h
  where h.code = p_code
  limit 1;
$$;

grant execute on function public.get_hangout_by_code(text) to authenticated;

-- Bill photos: private bucket. A bill's path is `<hangout_id>/<uuid>.<ext>`,
-- so read/write is allowed only to members of that hangout. The app fetches
-- short-lived signed URLs (createSignedUrl) instead of public URLs.
update storage.buckets set public = false where id = 'bills';

drop policy if exists "bills read" on storage.objects;
drop policy if exists "bills upload" on storage.objects;
drop policy if exists "bills delete" on storage.objects;

create policy "bills read" on storage.objects
  for select to authenticated using (
    bucket_id = 'bills'
    and is_hangout_member(nullif((storage.foldername(name))[1], '')::uuid)
  );
create policy "bills upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'bills'
    and is_hangout_member(nullif((storage.foldername(name))[1], '')::uuid)
  );
create policy "bills delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'bills'
    and is_hangout_member(nullif((storage.foldername(name))[1], '')::uuid)
  );
