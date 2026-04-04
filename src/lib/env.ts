function readEnv(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY' | 'VITE_ANTHROPIC_API_KEY') {
  const value = import.meta.env[key]

  if (!value || value.trim().length === 0) {
    return null
  }

  return value
}

export const env = {
  anthropicApiKey: readEnv('VITE_ANTHROPIC_API_KEY'),
  supabasePublishableKey: readEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
  supabaseUrl: readEnv('VITE_SUPABASE_URL'),
}
