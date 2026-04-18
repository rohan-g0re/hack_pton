# UI → Backend Changes Needed

> These are backend changes required to support the designed UI screens.
> **Do not implement these now** — they are recorded for a future implementation pass.

---

## Overview

The UI design was completed as a pixel-perfect Pencil mockup covering 13 screens across Caretaker (web) and Patient (mobile) user stories. The existing backend (`aegis/src/`) was **not modified**. The following gaps exist between the designed UI and the current backend.

---

## 1. Authentication & Role System

**Affected screens:** S1 (Landing), C1 (Onboarding), P1 (Patient Onboarding)

### Required changes:
- **No auth exists today.** Add a session model with two roles: `caretaker` and `patient`.
- Store role selection from S1 landing in a session cookie or localStorage key (`aegis_role`).
- Caretaker onboarding wizard (6 steps) needs to persist state across steps — consider a `setup` object in localStorage or a `/api/setup` route.
- Patient onboarding (3 steps) stores `name` (e.g. "Margaret") and `domain` (e.g. `medical`) to personalize the camera page.

### New API routes needed:
```
POST /api/auth/select-role   { role: "caretaker" | "patient" }
GET  /api/setup/status       → returns onboarding completion state
POST /api/setup/save         { step, data }
```

---

## 2. Dashboard Status Cards (C2)

**Affected screens:** C2 (Dashboard)

### Current state:
- No endpoint returns a unified status object for all three domains.

### Required changes:
- New route: `GET /api/status` → returns:
```json
{
  "grocery": { "status": "ok" | "warn" | "alert", "label": "Well stocked", "timestamp": "..." },
  "medical": { "status": "ok" | "warn" | "alert", "label": "Due at 12:00 PM", "nextMed": "Lisinopril 10mg" },
  "emergency": { "status": "ok" | "warn" | "alert", "label": "All clear" }
}
```
- This should be computed from recent events in `events.json`.

---

## 3. Grocery Page — Cart State (C3)

**Affected screens:** C3 (Groceries)

### Current state:
- No cart state is persisted. The grocery flow fires and disappears.

### Required changes:
- New route: `GET /api/grocery/cart` → returns pending cart items (from Knot shopping session).
- New route: `POST /api/grocery/cart/update` → accepts item edits from family.
- New route: `POST /api/grocery/cart/approve` → triggers Knot `syncCart` + `checkout`.
- Store cart state in `data/cart.json` (append-only with status field: `pending | approved | cancelled`).
- Order history: `GET /api/grocery/orders` → returns past completed carts from `data/cart.json`.

---

## 4. Medical Schedule API (C4)

**Affected screens:** C4 (Medical)

### Current state:
- `prescriptions.json` exists but is read-only from the frontend perspective.
- No endpoint for today's adherence per medication.

### Required changes:
- New route: `GET /api/medical/schedule` → returns today's schedule with adherence status per medication:
```json
[
  { "name": "Metformin 500mg", "time": "08:00", "status": "taken", "takenAt": "08:32" },
  { "name": "Lisinopril 10mg", "time": "12:00", "status": "due", "dueIn": "23 min" },
  { "name": "Atorvastatin 20mg", "time": "20:00", "status": "upcoming" }
]
```
- Derive status by comparing scheduled time to recent events in `events.json`.

- **Edit Schedule UI (Settings gear on Medical page):**
  - `PUT /api/medical/schedule` → accepts updated prescriptions array, writes to `prescriptions.json`.

---

## 5. Alerts — Filter Endpoint (C5)

**Affected screens:** C5 (Alerts)

### Current state:
- Events are stored in `events.json` but no filter endpoint exists.

### Required changes:
- Extend `GET /api/events` to support query params:
  - `?domain=grocery|medical|emergency`
  - `?date=YYYY-MM-DD`
  - `?limit=50`
- The UI needs all events with `domain`, `timestamp`, `message`, and `detail` fields.

---

## 6. Settings — Save Configuration (C6)

**Affected screens:** C6 (Settings)

### Current state:
- Config lives only in `.env.local`. No way to update iMessage chat IDs or elder name from the UI.

### Required changes:
- `GET /api/settings` → returns current config (sanitized — no raw API keys):
```json
{
  "elderName": "Margaret Johnson",
  "knotExternalUserId": "demo_elder_001",
  "imessage": {
    "groceryChatId": "+14155552671",
    "medicalChatId": "+14155552672",
    "emergencyChatId": "+14155552673"
  }
}
```
- `POST /api/settings` → saves to a `data/config.json` file (not `.env.local`).
- The backend should load config from `data/config.json` with `.env.local` as fallback.

---

## 7. Patient — Named Greeting + Personalization (P2)

**Affected screens:** P2 (Patient Home)

### Current state:
- The camera page at `/camera/[domain]` has no personalization.

### Required changes:
- Accept a `?name=Margaret` query param (or read from localStorage) to display personalized greeting.
- The greeting card on P2 should update based on time of day (Good morning / afternoon / evening).
- "All Good" status badge: derive from latest event for the patient's domain.

---

## 8. Patient SOS → Alert Pipeline (P4)

**Affected screens:** P4 (Patient SOS)

### Current state:
- No SOS endpoint exists. Emergency is detected only via camera vision.

### Required changes:
- New route: `POST /api/emergency/sos` → immediately sends iMessage alert to emergency chat:
```json
{ "source": "manual_sos", "message": "Margaret pressed SOS" }
```
- This should bypass the vision duplicate-suppression logic and always send.
- Response should include a confirmation that the message was sent.

---

## 9. Theme Toggle (All screens)

**Affected screens:** All

### Current state:
- No theme state in the app. `globals.css` has no dark/light mode classes.

### Required changes:
- Add `ThemeProvider` wrapper in `layout.tsx` using `next-themes` or a simple context.
- Read/write theme preference to `localStorage` key `aegis_theme`.
- Default to `dark`.
- CSS variables should switch between dark and light sets (matching Pencil design tokens).

Example CSS variables structure:
```css
:root[data-theme="dark"] {
  --bg-primary: #0B0D0F;
  --bg-surface: #141720;
  --bg-card: #1E2235;
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --accent: #4F8EF7;
  --grocery: #22C55E;
  --medical: #60A5FA;
  --emergency: #F43F5E;
}
:root[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --bg-surface: #F8FAFC;
  --bg-card: #FFFFFF;
  --text-primary: #0F172A;
  --text-secondary: #475569;
}
```

---

## 10. Route Structure — New Pages Needed

The following Next.js page files need to be created to match the designed screens:

| Screen | Route | Notes |
|--------|--------|-------|
| S1 Landing | `/` | Replace current debug page |
| C1 Onboarding | `/onboarding/caretaker` | Multi-step wizard |
| C2 Dashboard | `/dashboard` | Main caretaker view |
| C3 Groceries | `/dashboard/groceries` | |
| C4 Medical | `/dashboard/medical` | |
| C5 Alerts | `/dashboard/alerts` | |
| C6 Settings | `/dashboard/settings` | |
| P1 Patient Onboarding | `/onboarding/patient` | Mobile-first |
| P2 Patient Home | `/patient` | Mobile-first |
| P3 Patient Camera | `/camera/[domain]` | Already exists — needs UI upgrade |
| P4 Patient SOS | `/patient/sos` | New page |

---

## Priority Order for Implementation

1. **Route structure + theme system** (unblocks everything)
2. **`GET /api/status`** (unblocks dashboard)
3. **`GET /api/medical/schedule`** (unblocks medical page)
4. **`GET/POST /api/grocery/cart`** (unblocks grocery page)
5. **`GET /api/events` with filters** (unblocks alerts page)
6. **`GET/POST /api/settings`** (unblocks settings page)
7. **`POST /api/emergency/sos`** (unblocks patient SOS)
8. **Auth/role system** (can be lightweight localStorage-based for hackathon)
