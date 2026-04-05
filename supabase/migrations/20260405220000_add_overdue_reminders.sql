-- Pievieno lauku atgādinājumu izsekošanai
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;

-- Iespējo pg_cron un pg_net paplašinājumus automatizētiem uzdevumiem
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Palīgfunkcija: izsauc šo VIENU REIZI pēc izvietošanas ar Jūsu Supabase projekta datiem.
-- Piemērs:
--   SELECT public.setup_overdue_reminders_cron(
--     'https://xxxxxxxxxxxx.supabase.co',
--     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  -- service_role atslēga
--   );
CREATE OR REPLACE FUNCTION public.setup_overdue_reminders_cron(
  p_supabase_url text,
  p_service_role_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_name text := 'kaveto-rekinu-atgadinajumi';
BEGIN
  -- Noņem esošo uzdevumu, ja tāds ir
  PERFORM cron.unschedule(v_job_name)
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = v_job_name
    );

  -- Izveido jaunu uzdevumu: katru dienu plkst. 07:00 UTC (≈ 09:00–10:00 Rīgas laiks)
  PERFORM cron.schedule(
    v_job_name,
    '0 7 * * *',
    format(
      $cron$
        SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := '{}'::jsonb
        )
      $cron$,
      p_supabase_url || '/functions/v1/send-overdue-reminders',
      '{"Content-Type": "application/json", "Authorization": "Bearer ' || p_service_role_key || '"}'
    )
  );

  RETURN 'Uzdevums "' || v_job_name || '" veiksmīgi ieplānots (katru dienu 07:00 UTC).';
END;
$$;

REVOKE ALL ON FUNCTION public.setup_overdue_reminders_cron(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_overdue_reminders_cron(text, text) TO service_role;
