-- 0010_payment_vietqr.sql
-- Saved bank accounts for users, and member bank details for VietQR payments

-- 1. Create saved_bank_accounts table
create table if not exists public.saved_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, -- label or person's name (e.g. "Chị Vân Anh")
  bank_code text not null, -- e.g. "TCB", "VCB", "MB", etc.
  bank_name text not null default '', -- e.g. "Techcombank"
  account_no text not null,
  account_name text not null, -- e.g. "NGUYEN VAN A"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for user lookup
create index if not exists idx_saved_bank_accounts_user on public.saved_bank_accounts(user_id);

-- Enable RLS
alter table public.saved_bank_accounts enable row level security;

-- Drop existing policies if any
drop policy if exists "users manage their saved bank accounts" on public.saved_bank_accounts;

create policy "users manage their saved bank accounts"
  on public.saved_bank_accounts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Add bank account columns to hangout_members
alter table public.hangout_members
  add column if not exists bank_code text,
  add column if not exists bank_name text,
  add column if not exists bank_account_no text,
  add column if not exists bank_account_name text;

-- 3. Update get_bill_recap to include bank information in members array
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
