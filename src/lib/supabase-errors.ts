const TABLE_NOT_READY_MESSAGES = [
  "Could not find the table 'public.clients' in the schema cache",
  "Could not find the table 'public.profiles' in the schema cache",
  "Could not find the table 'public.expenses' in the schema cache",
  "Could not find the table 'public.invoices' in the schema cache",
]

export function getFriendlySupabaseError(message: string) {
  if (TABLE_NOT_READY_MESSAGES.some((entry) => message.includes(entry))) {
    return 'Datubāze vēl nav inicializēta. Atver Supabase SQL Editor un palaid sākotnējo migrāciju no faila `supabase/migrations/20260401193000_initial_schema.sql`.'
  }

  return message
}
