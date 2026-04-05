import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Verify authenticated user
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Nav autorizācijas' }), { status: 401, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Nav autorizācijas' }), { status: 401, headers: corsHeaders })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ error: 'RESEND_API_KEY nav konfigurēts Supabase secrets' }),
      { status: 500, headers: corsHeaders },
    )
  }

  const resendFrom = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev'

  const { to, subject, textBody, pdfBase64, fileName, replyTo } = await req.json() as {
    to: string
    subject: string
    textBody: string
    pdfBase64: string
    fileName: string
    replyTo?: string
  }

  if (!to || !pdfBase64) {
    return new Response(JSON.stringify({ error: 'Trūkst to vai pdfBase64' }), { status: 400, headers: corsHeaders })
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [to],
      cc: ['connect@gatisdesign.com'],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text: textBody,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    }),
  })

  if (!resendRes.ok) {
    const errorText = await resendRes.text()
    return new Response(
      JSON.stringify({ error: `Resend kļūda ${resendRes.status}: ${errorText}` }),
      { status: 500, headers: corsHeaders },
    )
  }

  const result = await resendRes.json()
  return new Response(JSON.stringify({ ok: true, id: result.id }), { headers: corsHeaders })
})
