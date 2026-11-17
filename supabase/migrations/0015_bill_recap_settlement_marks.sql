-- 0015_bill_recap_settlement_marks.sql
-- Surface the shared "paid" marks (settlement_marks, set in the app's Recap
-- tab) on the public /bill/:code page so it can show who has paid.

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
    'settlement_marks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from_member_id', sm.from_member_id,
        'to_member_id', sm.to_member_id
      ))
      from settlement_marks sm where sm.hangout_id = h.id
    ), '[]'::jsonb),
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

grant execute on function public.get_bill_recap(text) to anon, authenticated;
