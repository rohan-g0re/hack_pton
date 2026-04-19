-- Persist pairing codes in the cameras table so they survive server restarts.
alter table cameras
  add column if not exists pairing_code      text,
  add column if not exists pairing_expires_at timestamptz;

create unique index if not exists cameras_pairing_code_idx
  on cameras (pairing_code)
  where pairing_code is not null;
