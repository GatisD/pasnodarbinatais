import { createClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabasePublishableKey,
)

export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl!, env.supabasePublishableKey!)
  : null
