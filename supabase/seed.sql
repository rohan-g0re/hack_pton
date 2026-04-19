-- Demo household: Rohan Shah (caretaker) + Mira Shah (patient) + two cameras + inventory + prescriptions
-- Fixed UUIDs keep local scripts and tests stable.

begin;

insert into public.caretakers (id, name, phone, email, photon_status)
values (
  '11111111-1111-4111-8111-111111111101'::uuid,
  'Rohan Shah',
  '+1 609-555-0144',
  '',
  'not_configured'
)
on conflict (id) do nothing;

insert into public.patients (id, caretaker_id, name, relationship)
values (
  '22222222-2222-4222-8222-222222222202'::uuid,
  '11111111-1111-4111-8111-111111111101'::uuid,
  'Mira Shah',
  'Grandmother'
)
on conflict (id) do nothing;

insert into public.cameras (id, patient_id, role, device_name, bind_token, status)
values
  (
    '33333333-3333-4333-8333-333333333301'::uuid,
    '22222222-2222-4222-8222-222222222202'::uuid,
    'pantry',
    'Unregistered device',
    'bind-pantry-demo',
    'offline'
  ),
  (
    '33333333-3333-4333-8333-333333333302'::uuid,
    '22222222-2222-4222-8222-222222222202'::uuid,
    'medicine',
    'Unregistered device',
    'bind-medicine-demo',
    'offline'
  )
on conflict (id) do nothing;

insert into public.inventory_items (id, patient_id, name, target_quantity, low_stock_threshold, preferred_merchant)
values
  ('44444444-4444-4444-8444-444444444401'::uuid, '22222222-2222-4222-8222-222222222202'::uuid, 'Milk', 2, 1, 'Walmart'),
  ('44444444-4444-4444-8444-444444444402'::uuid, '22222222-2222-4222-8222-222222222202'::uuid, 'Bananas', 6, 2, 'Walmart'),
  ('44444444-4444-4444-8444-444444444403'::uuid, '22222222-2222-4222-8222-222222222202'::uuid, 'Oatmeal', 2, 1, 'Walmart'),
  ('44444444-4444-4444-8444-444444444404'::uuid, '22222222-2222-4222-8222-222222222202'::uuid, 'Apples', 5, 2, 'Walmart')
on conflict (id) do nothing;

insert into public.prescriptions (
  id,
  patient_id,
  medicine_name,
  expected_count,
  scheduled_time,
  window_minutes,
  purpose
)
values
  (
    '55555555-5555-4555-8555-555555555501'::uuid,
    '22222222-2222-4222-8222-222222222202'::uuid,
    'Allergy Relief',
    1,
    (now()::time),
    30,
    'Seasonal allergy control'
  ),
  (
    '55555555-5555-4555-8555-555555555502'::uuid,
    '22222222-2222-4222-8222-222222222202'::uuid,
    'Vitamin D',
    1,
    (now()::time),
    30,
    'Daily vitamin support'
  )
on conflict (id) do nothing;

insert into public.events (id, patient_id, type, severity, title, message)
values (
  '66666666-6666-4666-8666-666666666601'::uuid,
  '22222222-2222-4222-8222-222222222202'::uuid,
  'system',
  'info',
  'Demo household ready',
  'Dashboard initialized for one caretaker, one patient, and two camera roles.'
)
on conflict (id) do nothing;

commit;
