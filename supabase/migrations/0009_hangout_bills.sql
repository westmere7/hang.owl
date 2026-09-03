-- 0009: Hangout-level bill receipts.
-- Adds bill_paths to hangouts for group-level receipts (e.g. uploaded in Recap tab),
-- surfaces them in get_bill_recap, and allows authenticated/anon to read bill photos
-- when given a path.

alter table public.hangouts
  add column if not exists bill_paths text[] not null default '{}';

-- Allow updating bill_paths:
create or replace function public.update_hangout_bills(p_hangout uuid, p_bill_paths text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    is_hangout_admin(p_hangout)
    or (
      is_hangout_member(p_hangout)
      and exists (select 1 from hangouts h where h.id = p_hangout and h.guest_can_edit_recap)
    )
  ) then
    raise exception 'not allowed to update hangout bills';
  end if;

  update hangouts set bill_paths = p_bill_paths where id = p_hangout;
end;
$$;

grant execute on function public.update_hangout_bills(uuid, text[]) to authenticated;

-- Update get_bill_recap to include bill_paths and spend bill_path
create or replace function public.get_bill_recap(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'currency', h.currency,
    'starts_on', h.starts_on,
    'ends_on', h.ends_on,
    'status', h.status,
    'deposit_holder_id', h.deposit_holder_id,
    'bill_paths', coalesce(h.bill_paths, array[]::text[]),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'display_name', m.display_name,
        'deposit', m.deposit,
        'share_override', m.share_override,
        'is_admin', m.is_admin
      ) order by m.joined_at)
      from hangout_members m where m.hangout_id = h.id
    ), '[]'::jsonb),
    'spends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'category', s.category,
        'amount', s.amount,
        'spent_at', s.spent_at,
        'spender_member_id', s.spender_member_id,
        'bill_path', s.bill_path,
        'shares', coalesce((
          select jsonb_agg(jsonb_build_object('member_id', sh.member_id, 'weight', sh.weight))
          from spend_shares sh where sh.spend_id = s.id
        ), '[]'::jsonb)
      ) order by s.spent_at desc)
      from spends s where s.hangout_id = h.id
    ), '[]'::jsonb)
  )
  from hangouts h
  where h.code = p_code
  limit 1;
$$;

grant execute on function public.get_bill_recap(text) to anon, authenticated;

-- Storage: allow reading bill photos by authenticated & anon users
drop policy if exists "bills read" on storage.objects;
create policy "bills read" on storage.objects
  for select to authenticated, anon using (
    bucket_id = 'bills'
  );
