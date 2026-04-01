import { supabase } from '@/lib/supabase'

export async function ensureProfileExists(userId: string, email?: string | null) {
  if (!supabase) {
    return
  }

  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    email: email ?? null,
  })

  if (error) {
    throw error
  }
}
