-- 0012_auto_sync_bank_accounts.sql
-- Automatically synchronize saved bank accounts with hangout_members

create or replace function public.sync_saved_bank_account_to_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.hangout_members
  set
    bank_code = NEW.bank_code,
    bank_name = NEW.bank_name,
    bank_account_no = NEW.account_no,
    bank_account_name = NEW.account_name
  where
    profile_id = NEW.user_id
    or display_name ilike NEW.name;

  return NEW;
end;
$$;

drop trigger if exists tr_sync_saved_bank_account on public.saved_bank_accounts;
create trigger tr_sync_saved_bank_account
after insert or update on public.saved_bank_accounts
for each row
execute function public.sync_saved_bank_account_to_members();

-- Trigger when a new hangout_member is added without bank details:
create or replace function public.sync_member_from_saved_bank_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank public.saved_bank_accounts%rowtype;
begin
  if NEW.bank_code is null or NEW.bank_account_no is null then
    select * into v_bank
    from public.saved_bank_accounts
    where
      (NEW.profile_id is not null and user_id = NEW.profile_id)
      or display_name ilike NEW.display_name
      or name ilike NEW.display_name
    order by updated_at desc
    limit 1;

    if found then
      NEW.bank_code := v_bank.bank_code;
      NEW.bank_name := v_bank.bank_name;
      NEW.bank_account_no := v_bank.account_no;
      NEW.bank_account_name := v_bank.account_name;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists tr_sync_member_from_saved_bank_account on public.hangout_members;
create trigger tr_sync_member_from_saved_bank_account
before insert on public.hangout_members
for each row
execute function public.sync_member_from_saved_bank_account();

-- Backfill existing hangout_members from saved_bank_accounts:
update public.hangout_members hm
set
  bank_code = s.bank_code,
  bank_name = s.bank_name,
  bank_account_no = s.account_no,
  bank_account_name = s.account_name
from public.saved_bank_accounts s
where
  (hm.bank_code is null or hm.bank_account_no is null)
  and (
    (hm.profile_id is not null and s.user_id = hm.profile_id)
    or hm.display_name ilike s.name
  );
