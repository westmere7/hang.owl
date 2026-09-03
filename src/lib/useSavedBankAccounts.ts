import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { SavedBankAccount } from '../types'
import { errorMessage } from './errors'
import { useApp } from '../context/AppContext'

export function useSavedBankAccounts() {
  const { ready, userId } = useApp()
  const [accounts, setAccounts] = useState<SavedBankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!ready || !userId) {
      setAccounts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('saved_bank_accounts')
        .select('*')
        .order('name', { ascending: true })
      if (fetchErr) throw fetchErr
      setAccounts((data ?? []) as SavedBankAccount[])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [ready, userId])

  useEffect(() => {
    void load()
  }, [load])

  const saveAccount = async (account: {
    id?: string
    name: string
    bank_code: string
    bank_name: string
    account_no: string
    account_name: string
  }) => {
    setError(null)
    const payload = {
      name: account.name.trim(),
      bank_code: account.bank_code.trim().toUpperCase(),
      bank_name: account.bank_name.trim(),
      account_no: account.account_no.trim().replace(/\s+/g, ''),
      account_name: account.account_name.trim().toUpperCase(),
      updated_at: new Date().toISOString(),
    }

    if (account.id) {
      const { error: upErr } = await supabase
        .from('saved_bank_accounts')
        .update(payload)
        .eq('id', account.id)
      if (upErr) throw upErr
    } else {
      const { error: inErr } = await supabase.from('saved_bank_accounts').insert(payload)
      if (inErr) throw inErr
    }

    // Auto-sync to hangout_members for the user or matching member name
    try {
      if (userId) {
        await supabase
          .from('hangout_members')
          .update({
            bank_code: payload.bank_code,
            bank_name: payload.bank_name,
            bank_account_no: payload.account_no,
            bank_account_name: payload.account_name,
          })
          .or(`profile_id.eq.${userId},display_name.ilike.${payload.name}`)
      }
    } catch {
      // Non-fatal if RLS restricts
    }

    await load()
  }

  const deleteAccount = async (id: string) => {
    setError(null)
    const { error: delErr } = await supabase.from('saved_bank_accounts').delete().eq('id', id)
    if (delErr) throw delErr
    await load()
  }

  return { accounts, loading, error, reload: load, saveAccount, deleteAccount }
}
