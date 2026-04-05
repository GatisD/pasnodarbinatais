-- Pievieno 'nosutits' statusu invoice_status enum
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'nosutits';
