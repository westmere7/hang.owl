-- 0014_fix_bank_sync_and_restore_danh.sql
-- Fix bank account synchronization and restore Danh's bank info

-- 1. Restore Danh's bank details in hangout_members from saved_bank_accounts
update public.hangout_members
set
  bank_code = sba.bank_code,
  bank_name = sba.bank_name,
  bank_account_no = sba.account_no,
  bank_account_name = sba.account_name
from public.saved_bank_accounts sba
where
  sba.name ilike 'Danh'
  and hangout_members.display_name ilike 'Danh';

-- 2. Fix sync_saved_bank_account_to_members()
-- When a saved bank account is inserted or updated, it should ONLY update
-- members whose display_name matches the saved bank account name, or
-- if it's explicitly for the user themselves ('myself', 'me', or matching profile display name).
create or replace function public.sync_saved_bank_account_to_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_name text;
begin
  select display_name into v_profile_name
  from public.profiles
  where id = NEW.user_id;

  update public.hangout_members
  set
    bank_code = NEW.bank_code,
    bank_name = NEW.bank_name,
    bank_account_no = NEW.account_no,
    bank_account_name = NEW.account_name
  where
    -- Direct name match
    display_name ilike NEW.name
    -- Or if this saved account is explicitly for the user themselves
    or (
      profile_id = NEW.user_id
      and (
        NEW.name ilike 'myself'
        or NEW.name ilike 'me'
        or (v_profile_name is not null and NEW.name ilike v_profile_name)
      )
    );

  return NEW;
end;
$$;

-- 3. Fix sync_member_from_saved_bank_account()
-- When a new member is added without bank details:
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
      name ilike NEW.display_name
      or (
        NEW.profile_id is not null
        and user_id = NEW.profile_id
        and (
          name ilike 'myself'
          or name ilike 'me'
          or name ilike (select display_name from public.profiles where id = NEW.profile_id)
        )
      )
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

-- 4. Trigger on DELETE of saved_bank_accounts:
-- When a bank account is deleted, if hangout_members has that account,
-- check if there's another saved bank account for that member. If yes, switch to it;
-- if no, clear the bank details so it doesn't stay stuck with old deleted bank info.
create or replace function public.handle_deleted_saved_bank_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fallback public.saved_bank_accounts%rowtype;
  m record;
begin
  -- For each member that had the deleted account number:
  for m in
    select id, display_name, profile_id
    from public.hangout_members
    where bank_account_no = OLD.account_no
  loop
    -- Look for a fallback saved bank account
    select * into v_fallback
    from public.saved_bank_accounts
    where
      name ilike m.display_name
      or (
        m.profile_id is not null
        and user_id = m.profile_id
        and (
          name ilike 'myself'
          or name ilike 'me'
          or name ilike (select display_name from public.profiles where id = m.profile_id)
        )
      )
    order by updated_at desc
    limit 1;

    if found then
      update public.hangout_members
      set
        bank_code = v_fallback.bank_code,
        bank_name = v_fallback.bank_name,
        bank_account_no = v_fallback.account_no,
        bank_account_name = v_fallback.account_name
      where id = m.id;
    else
      update public.hangout_members
      set
        bank_code = null,
        bank_name = null,
        bank_account_no = null,
        bank_account_name = null
      where id = m.id;
    end if;
  end loop;

  return OLD;
end;
$$;

drop trigger if exists tr_delete_saved_bank_account on public.saved_bank_accounts;
create trigger tr_delete_saved_bank_account
after delete on public.saved_bank_accounts
for each row
execute function public.handle_deleted_saved_bank_account();
