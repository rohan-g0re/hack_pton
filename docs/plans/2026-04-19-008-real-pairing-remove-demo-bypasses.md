---
title: "Real Code-Based Pairing + Remove All Demo Bypasses"
type: feat
status: active
date: 2026-04-19
---

# Real Pairing + Remove Demo Bypasses

## Problem

1. Pairing codes are stored in an in-memory Map → lost on server restart (pm2 restart kills all pending pairings)
2. "Skip for Demo" button bypasses pairing entirely — must be removed
3. `scene_id` canned-scene path in workers lets snapshots succeed without a real camera image — must be removed
4. Demo Knot card token fallback (`"demo_knot_card_token"`) — must be removed
5. Camera-room scene selector dropdown is a demo artifact — must be removed

## Changes

### 1. Supabase migration — persist pairing codes
Add `pairing_code TEXT` and `pairing_expires_at TIMESTAMPTZ` to `cameras` table.
File: `supabase/migrations/002_pairing_codes.sql`

### 2. supabase-store.mjs — durable pairing
- Remove `this.pairingCodes = new Map()`
- `generatePairingCode(role)`: write code + expiry to `cameras` row by role
- `pairCamera(code)`: read from `cameras` WHERE `pairing_code = code AND pairing_expires_at > now()`, clear the code, set status online

### 3. Remove skipBindForDemo
- `supabase-store.mjs`: delete `skipBindForDemo()` method
- `src/app.mjs`: delete `/api/cameras/bind-skip` route
- `public/bind.js`: delete "Skip for Demo" button handler + `POST /api/cameras/bind-skip` call
- `public/bind.html`: delete skip button element

### 4. Remove scene_id demo path from workers
- `services/worker/gemini-pantry.mjs`: delete `scene_id` branch; require `image_url` + Gemini
- `services/worker/gemini-medicine.mjs`: same
- `src/demo-data.mjs`: keep for seed (seed script still uses it) but remove `getSeedScenes` export if no longer used by workers

### 5. Remove scene selector from camera-room
- `public/camera-room.js`: remove scene dropdown population + `sceneId` field from snapshot payload
- `public/camera-room.html` (if exists): remove `<select>` element for scenes

### 6. Remove demo Knot card token fallback
- `src/supabase-store.mjs` `updatePaymentCardDemo()`: remove `|| "demo_knot_card_token"` fallback; throw if no real token

## Files Touched
- `supabase/migrations/002_pairing_codes.sql` (new)
- `src/supabase-store.mjs`
- `src/app.mjs`
- `public/bind.js`
- `public/bind.html`
- `public/camera-room.js`
- `services/worker/gemini-pantry.mjs`
- `services/worker/gemini-medicine.mjs`
