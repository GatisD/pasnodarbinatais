create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tax_regime') then
    create type public.tax_regime as enum ('visparejais', 'mun');
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('izrakstits', 'apmaksats', 'kavejas', 'atcelts');
  end if;

  if not exists (select 1 from pg_type where typname = 'expense_category') then
    create type public.expense_category as enum (
      'sakari',
      'transports',
      'degviela',
      'biroja_preces',
      'programmatura',
      'majaslapa',
      'reklama',
      'gramatvediba',
      'telpu_noma',
      'komunalie',
      'apdrosinasana',
      'profesionala_izglitiba',
      'aprikojums',
      'bankas_komisija',
      'citi'
    );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  person_code text,
  nace_code text,
  tax_regime public.tax_regime not null default 'visparejais',
  is_vat_payer boolean not null default false,
  bank_name text,
  bank_iban text,
  address text,
  phone text,
  email text,
  invoice_prefix text not null default 'R',
  invoice_sequence integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  reg_number text,
  address text,
  email text,
  bank_iban text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  invoice_number text unique,
  issue_date date not null,
  due_date date not null,
  status public.invoice_status not null default 'izrakstits',
  subtotal numeric(12, 2) not null default 0,
  vat_rate numeric(5, 4) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  currency text not null default 'EUR',
  notes text,
  paid_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit text not null default 'gab.',
  unit_price numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  category public.expense_category not null,
  vendor text,
  description text,
  receipt_url text,
  receipt_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists clients_user_id_idx on public.clients (user_id);
create index if not exists invoices_user_id_idx on public.invoices (user_id);
create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index if not exists expenses_user_id_idx on public.expenses (user_id);
create index if not exists expenses_date_idx on public.expenses (date);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();

create or replace function public.generate_invoice_number()
returns trigger
language plpgsql
as $$
declare
  year_part text;
  current_sequence integer;
  current_prefix text;
begin
  if new.invoice_number is not null then
    return new;
  end if;

  year_part := to_char(new.issue_date, 'YYYY');

  select invoice_prefix, invoice_sequence
    into current_prefix, current_sequence
  from public.profiles
  where id = new.user_id
  for update;

  if current_prefix is null then
    current_prefix := 'R';
  end if;

  if current_sequence is null then
    current_sequence := 1;
  end if;

  new.invoice_number := current_prefix || '-' || year_part || '-' || lpad(current_sequence::text, 3, '0');

  update public.profiles
  set invoice_sequence = current_sequence + 1
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists set_invoice_number on public.invoices;
create trigger set_invoice_number
before insert on public.invoices
for each row
execute function public.generate_invoice_number();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id);

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own"
on public.clients
for select
using (auth.uid() = user_id);

drop policy if exists "clients_insert_own" on public.clients;
create policy "clients_insert_own"
on public.clients
for insert
with check (auth.uid() = user_id);

drop policy if exists "clients_update_own" on public.clients;
create policy "clients_update_own"
on public.clients
for update
using (auth.uid() = user_id);

drop policy if exists "clients_delete_own" on public.clients;
create policy "clients_delete_own"
on public.clients
for delete
using (auth.uid() = user_id);

drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own"
on public.invoices
for select
using (auth.uid() = user_id);

drop policy if exists "invoices_insert_own" on public.invoices;
create policy "invoices_insert_own"
on public.invoices
for insert
with check (auth.uid() = user_id);

drop policy if exists "invoices_update_own" on public.invoices;
create policy "invoices_update_own"
on public.invoices
for update
using (auth.uid() = user_id);

drop policy if exists "invoices_delete_own" on public.invoices;
create policy "invoices_delete_own"
on public.invoices
for delete
using (auth.uid() = user_id);

drop policy if exists "invoice_items_select_own" on public.invoice_items;
create policy "invoice_items_select_own"
on public.invoice_items
for select
using (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and i.user_id = auth.uid()
  )
);

drop policy if exists "invoice_items_insert_own" on public.invoice_items;
create policy "invoice_items_insert_own"
on public.invoice_items
for insert
with check (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and i.user_id = auth.uid()
  )
);

drop policy if exists "invoice_items_update_own" on public.invoice_items;
create policy "invoice_items_update_own"
on public.invoice_items
for update
using (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and i.user_id = auth.uid()
  )
);

drop policy if exists "invoice_items_delete_own" on public.invoice_items;
create policy "invoice_items_delete_own"
on public.invoice_items
for delete
using (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and i.user_id = auth.uid()
  )
);

drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own"
on public.expenses
for select
using (auth.uid() = user_id);

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own"
on public.expenses
for insert
with check (auth.uid() = user_id);

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own"
on public.expenses
for update
using (auth.uid() = user_id);

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own"
on public.expenses
for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-documents',
  'expense-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "expense_documents_select_own" on storage.objects;
create policy "expense_documents_select_own"
on storage.objects
for select
using (
  bucket_id = 'expense-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "expense_documents_insert_own" on storage.objects;
create policy "expense_documents_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'expense-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "expense_documents_update_own" on storage.objects;
create policy "expense_documents_update_own"
on storage.objects
for update
using (
  bucket_id = 'expense-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "expense_documents_delete_own" on storage.objects;
create policy "expense_documents_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'expense-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);
