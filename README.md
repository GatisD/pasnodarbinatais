# Pašnodarbinātais / Self Employed

Privāta web lietotne pašnodarbinātai personai Latvijā: rēķini, izdevumi, atskaites un klientu uzskaite vienuviet.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- Supabase (Auth, PostgreSQL, RLS, Storage)
- Recharts
- `@react-pdf/renderer`

## Palaist lokāli

```bash
npm install
npm run dev
```

## Vides mainīgie

Nokopē `.env.example` uz `.env` un aizpildi vērtības:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## Supabase

Šobrīd repozitorijā jau ir sagatavots:

- `supabase/migrations/20260401193000_initial_schema.sql`
- bāzes tabulas, enum tipi, RLS un storage bucket politika

Kad `supabase` CLI būs uzstādīts:

```bash
supabase login
supabase link --project-ref yfznolyoddzbhosoacws
supabase db push
```

## Dokumentācija

- `docs/technical-spec-v1.md`
- `docs/implementation-plan.md`
