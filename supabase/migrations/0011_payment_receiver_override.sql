-- 0011_payment_receiver_override.sql
-- Allow setting an override payment receiver for a hangout so one person collects all payments

-- 1. Add payment_receiver_id column to hangouts table
alter table public.hangouts
  add column if not exists payment_receiver_id uuid
    references public.hangout_members (id) on delete set null;

-- 2. Function to set or clear the payment receiver
create or replace function public.set_payment_receiver(p_hangout uuid, p_member uuid)
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
    raise exception 'not allowed to set the payment receiver';
  end if;

  if p_member is not null and not exists (
    select 1 from hangout_members m where m.id = p_member and m.hangout_id = p_hangout
  ) then
    raise exception 'member does not belong to this hangout';
  end if;

  update hangouts set payment_receiver_id = p_member where id = p_hangout;
end;
$$;

-- 3. Update get_bill_recap to include payment_receiver_id
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
    'payment_receiver_id', h.payment_receiver_id,
    'bill_paths', coalesce(h.bill_paths, array[]::text[]),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'display_name', m.display_name,
        'deposit', m.deposit,
        'share_override', m.share_override,
        'is_admin', m.is_admin,
        'bank_code', m.bank_code,
        'bank_name', m.bank_name,
        'bank_account_no', m.bank_account_no,
        'bank_account_name', m.bank_account_name
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
