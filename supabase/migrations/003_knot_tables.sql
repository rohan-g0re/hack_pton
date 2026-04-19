-- Knot merchant accounts: one row per patient+merchant pairing
create table if not exists knot_merchant_accounts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  external_user_id text not null,
  merchant_id int not null,
  merchant_name text not null default 'Walmart',
  status text not null default 'disconnected'
    check (status in ('connected','disconnected','login_required')),
  last_authenticated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, merchant_id)
);

-- Knot webhook events: idempotency store
create table if not exists knot_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  session_id text,
  task_id text,
  external_user_id text,
  merchant_id int,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event, task_id)
);

-- Expand checkout_sessions with Knot async workflow columns
alter table checkout_sessions
  add column if not exists merchant_id int,
  add column if not exists external_user_id text,
  add column if not exists knot_task_id text,
  add column if not exists transaction_ids jsonb,
  add column if not exists error_message text;

-- Update checkout_sessions status values to include Knot async states
-- (existing rows keep their status; only new inserts use the new values)
