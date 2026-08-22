-- 0008: Public, read-only bill recap by code. Powers the shareable
-- /bill/:code page — anyone with the link can see the breakdown, without an
-- account or membership. The code is the access token (same model as join).

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

-- Callable by anyone with the link, signed in or not.
grant execute on function public.get_bill_recap(text) to anon, authenticated;
