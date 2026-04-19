-- Migration 004: Photon alert outbox, recipient readiness, and notification lifecycle fixes
-- Apply after 001_initial_schema.sql, 002_pairing_codes.sql, 003_knot_tables.sql
-- RLS is permissive for hackathon demo; tighten before production.

begin;

-- --------------------------------------------------------------------------- events: acknowledgement support for iMessage ack command
alter table public.events
  add column if not exists acknowledged boolean not null default false,
  add column if not exists acknowledged_at timestamptz;

-- --------------------------------------------------------------------------- caretakers: Photon recipient readiness columns
alter table public.caretakers
  add column if not exists email text not null default '',
  add column if not exists photon_status text not null default 'not_configured'
    constraint caretakers_photon_status_check check (
      photon_status in (
        'not_configured',
        'invited',
        'thread_open',
        'sendable',
        'onboarding_blocked',
        'failed'
      )
    ),
  add column if not exists photon_thread_opened_at timestamptz,
  add column if not exists photon_last_error text,
  add column if not exists photon_last_smoke_test_at timestamptz;

-- --------------------------------------------------------------------------- notifications: fix delivery_status default
-- Previously defaulted to 'sent', which falsely marked undelivered alerts.
-- Change default to 'pending' so alerts start in the correct lifecycle state.
alter table public.notifications
  alter column delivery_status set default 'pending';

-- Also add 'blocked' status for onboarding-blocked Photon errors.
alter table public.notifications
  drop constraint if exists notifications_delivery_check;
alter table public.notifications
  add constraint notifications_delivery_check check (
    delivery_status in ('pending', 'sent', 'delivered', 'failed', 'blocked')
  );

-- --------------------------------------------------------------------------- photon_outbox
create table if not exists public.photon_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  recipient_phone text not null,
  message_body text not null,
  snapshot_url text,
  status text not null default 'pending'
    constraint photon_outbox_status_check check (
      status in ('pending', 'sending', 'sent', 'failed', 'blocked')
    ),
  attempts int not null default 0,
  error_code text,
  error_message text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photon_outbox_pending_idx
  on public.photon_outbox (status, next_attempt_at)
  where status = 'pending';

create index if not exists photon_outbox_event_id_idx
  on public.photon_outbox (event_id);

create index if not exists photon_outbox_notification_id_idx
  on public.photon_outbox (notification_id);

-- --------------------------------------------------------------------------- claim_photon_outbox: atomically claim a batch of pending rows
-- Returns claimed row ids. Uses FOR UPDATE SKIP LOCKED for safe concurrent access.
create or replace function public.claim_photon_outbox(batch_size int default 10)
returns setof uuid
language plpgsql
security definer
as $$
begin
  return query
    update public.photon_outbox
    set
      status = 'sending',
      updated_at = now()
    where id in (
      select id from public.photon_outbox
      where status = 'pending'
        and (next_attempt_at is null or next_attempt_at <= now())
      order by created_at asc
      limit batch_size
      for update skip locked
    )
    returning id;
end;
$$;

-- --------------------------------------------------------------------------- RLS for new tables
alter table public.photon_outbox enable row level security;

do $$
begin
  execute 'drop policy if exists demo_allow_all on public.photon_outbox';
  execute 'create policy demo_allow_all on public.photon_outbox for all using (true) with check (true)';
end $$;

-- --------------------------------------------------------------------------- Realtime for outbox visibility
do $$
begin
  alter publication supabase_realtime add table public.photon_outbox;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

commit;
