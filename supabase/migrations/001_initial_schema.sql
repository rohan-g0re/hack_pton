-- Caretaker Command Center — initial schema (PostgreSQL / Supabase)
-- RLS is permissive for hackathon demo; tighten before production.

begin;

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------- caretakers
create table if not exists public.caretakers (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  phone text not null default '',
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------- patients
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid (),
  caretaker_id uuid not null references public.caretakers (id) on delete cascade,
  name text not null,
  relationship text not null default '' ,
  created_at timestamptz not null default now()
);

create index if not exists patients_caretaker_id_idx on public.patients (caretaker_id);

-- --------------------------------------------------------------------------- cameras
create table if not exists public.cameras (
  id uuid primary key default gen_random_uuid (),
  patient_id uuid not null references public.patients (id) on delete cascade,
  role text not null check (role in ('pantry', 'medicine')),
  device_name text not null default 'Unregistered device',
  bind_token text not null default '',
  status text not null default 'offline',
  last_seen_at timestamptz,
  last_snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cameras_patient_role_unique unique (patient_id, role)
);

create index if not exists cameras_patient_id_idx on public.cameras (patient_id);

-- --------------------------------------------------------------------------- inventory_items
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid (),
  patient_id uuid not null references public.patients (id) on delete cascade,
  name text not null,
  target_quantity int not null default 0,
  low_stock_threshold int not null default 0,
  preferred_merchant text not null default 'Walmart',
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_patient_id_idx on public.inventory_items (patient_id);

-- --------------------------------------------------------------------------- prescriptions
create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid (),
  patient_id uuid not null references public.patients (id) on delete cascade,
  medicine_name text not null,
  expected_count int not null default 1,
  scheduled_time time not null,
  window_minutes int not null default 30,
  purpose text not null default '' ,
  updated_at timestamptz not null default now()
);

create index if not exists prescriptions_patient_id_idx on public.prescriptions (patient_id);

-- --------------------------------------------------------------------------- payment_cards
create table if not exists public.payment_cards (
  id uuid primary key default gen_random_uuid (),
  patient_id uuid not null references public.patients (id) on delete cascade,
  knot_card_token text not null,
  card_last_four text not null,
  card_brand text not null default '' ,
  created_at timestamptz not null default now()
);

create index if not exists payment_cards_patient_id_idx on public.payment_cards (patient_id);

-- --------------------------------------------------------------------------- snapshots
create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid (),
  camera_id uuid not null references public.cameras (id) on delete cascade,
  image_url text,
  scene_id text,
  captured_at timestamptz not null default now(),
  processed boolean not null default false,
  constraint snapshots_image_or_scene check (
    image_url is not null
    or scene_id is not null
  )
);

create index if not exists snapshots_camera_processed_idx on public.snapshots (camera_id, processed);
create index if not exists snapshots_processed_idx on public.snapshots (processed);

-- --------------------------------------------------------------------------- pantry_analyses
create table if not exists public.pantry_analyses (
  id uuid primary key default gen_random_uuid (),
  snapshot_id uuid not null references public.snapshots (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  detected_items jsonb not null default '[]'::jsonb,
  low_items jsonb not null default '[]'::jsonb,
  confidence double precision,
  raw_gemini_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pantry_analyses_snapshot_id_idx on public.pantry_analyses (snapshot_id);

-- --------------------------------------------------------------------------- purchase_proposals
create table if not exists public.purchase_proposals (
  id uuid primary key default gen_random_uuid (),
  patient_id uuid not null references public.patients (id) on delete cascade,
  analysis_id uuid references public.pantry_analyses (id) on delete set null,
  status text not null default 'awaiting_approval',
  merchant text not null default 'Walmart',
  items jsonb not null default '[]'::jsonb,
  estimated_total numeric(12, 2) not null default 0,
  confidence double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_proposals_status_check check (
    status in (
      'awaiting_approval',
      'review',
      'approved',
      'rejected',
      'completed',
      'failed'
    )
  )
);

create index if not exists purchase_proposals_patient_id_idx on public.purchase_proposals (patient_id);
create index if not exists purchase_proposals_status_idx on public.purchase_proposals (status);

-- --------------------------------------------------------------------------- checkout_sessions (proposal FK added after purchase_proposals exists)
create table if not exists public.checkout_sessions (
  id uuid primary key default gen_random_uuid (),
  proposal_id uuid not null references public.purchase_proposals (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  provider text not null default 'Knot API',
  merchant text not null default 'Walmart',
  status text not null default 'pending',
  knot_session_id text,
  card_last_four text,
  created_at timestamptz not null default now(),
  constraint checkout_sessions_status_check check (status in ('pending', 'success', 'failed'))
);

create index if not exists checkout_sessions_proposal_id_idx on public.checkout_sessions (proposal_id);

alter table public.purchase_proposals add column if not exists checkout_id uuid;

alter table public.purchase_proposals
  add constraint purchase_proposals_checkout_fk foreign key (checkout_id) references public.checkout_sessions (id);

-- --------------------------------------------------------------------------- medication_checks
create table if not exists public.medication_checks (
  id uuid primary key default gen_random_uuid (),
  snapshot_id uuid not null references public.snapshots (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  adherence_status text not null,
  due_prescriptions jsonb not null default '[]'::jsonb,
  detected_pills jsonb not null default '[]'::jsonb,
  confidence double precision,
  raw_gemini_response jsonb,
  created_at timestamptz not null default now(),
  constraint medication_checks_adherence_check check (
    adherence_status in (
      'taken',
      'missed',
      'wrong_pill',
      'uncertain',
      'outside_window'
    )
  )
);

-- --------------------------------------------------------------------------- events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid (),
  patient_id uuid not null references public.patients (id) on delete cascade,
  type text not null,
  severity text not null,
  title text not null,
  message text not null,
  related_id uuid,
  created_at timestamptz not null default now(),
  constraint events_type_check check (
    type in ('pantry', 'medication', 'checkout', 'system', 'profile', 'inventory', 'prescription', 'camera')
  ),
  constraint events_severity_check check (
    severity in ('info', 'success', 'warning', 'critical')
  )
);

create index if not exists events_patient_id_idx on public.events (patient_id);
create index if not exists events_created_at_idx on public.events (created_at desc);

-- --------------------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid (),
  event_id uuid not null references public.events (id) on delete cascade,
  channel text not null default 'photon_imessage',
  recipient text not null,
  message text not null,
  delivery_status text not null default 'sent',
  sent_at timestamptz not null default now(),
  constraint notifications_delivery_check check (
    delivery_status in ('sent', 'delivered', 'failed', 'pending')
  )
);

create index if not exists notifications_event_id_idx on public.notifications (event_id);

-- --------------------------------------------------------------------------- RLS (permissive demo policies)
alter table public.caretakers enable row level security;
alter table public.patients enable row level security;
alter table public.cameras enable row level security;
alter table public.inventory_items enable row level security;
alter table public.prescriptions enable row level security;
alter table public.payment_cards enable row level security;
alter table public.snapshots enable row level security;
alter table public.pantry_analyses enable row level security;
alter table public.purchase_proposals enable row level security;
alter table public.checkout_sessions enable row level security;
alter table public.medication_checks enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;

do $$
declare
  t text;
begin
  foreach t in array ARRAY[
    'caretakers',
    'patients',
    'cameras',
    'inventory_items',
    'prescriptions',
    'payment_cards',
    'snapshots',
    'pantry_analyses',
    'purchase_proposals',
    'checkout_sessions',
    'medication_checks',
    'events',
    'notifications'
  ]
  loop
    execute format(
      'drop policy if exists demo_allow_all on public.%I',
      t
    );
    execute format(
      'create policy demo_allow_all on public.%I for all using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- --------------------------------------------------------------------------- Realtime (Supabase hosted)
do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.purchase_proposals;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cameras;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

commit;
