-- Only fully signed-in (non-anonymous) users may create a hangout.
-- Anonymous users can still join hangouts by QR, add spends, etc. — they
-- just can't start a new hangout. Enforced in the DB, mirroring the UI gate.
--
-- Supabase puts an `is_anonymous` claim in the JWT; permanent accounts have
-- it false (or absent). Anonymous users can upgrade in place (same user id),
-- so a person keeps the hangouts they already made when they sign up.

drop policy if exists "hangouts insert" on public.hangouts;

create policy "hangouts insert" on public.hangouts
  for insert to authenticated
  with check (
    admin_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
