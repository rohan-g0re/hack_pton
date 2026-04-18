---
title: "feat: Aegis Frontend Rebuild — Full Dark/Light UI from Pencil Designs"
type: feat
status: active
date: 2026-04-18
origin: docs/ui-backend-changes-needed.md
---

# feat: Aegis Frontend Rebuild

## Overview

Replace the existing single-page debug dashboard with a complete multi-page application matching the Pencil mockups. Two user stories (Caretaker on desktop, Patient on mobile), dark mode default with light toggle, Funnel Sans typography, and all backend API routes needed to power the new UI.

## Problem Frame

The current codebase has a working backend (vision, Knot, iMessage, scheduler, events) but only a single debug dashboard page. The Pencil designs define 11 screens across Caretaker and Patient flows. This plan rebuilds the frontend and adds the missing API endpoints.

## Scope

- 11 new/modified pages matching Pencil designs
- Theme system (dark default, light toggle) with CSS variables
- 7 new API routes for status, medical schedule, grocery cart, alerts filter, settings, SOS
- Font swap to Funnel Sans + Geist Mono
- Responsive: desktop (1440px) for Caretaker, mobile (390px) for Patient
- localStorage-based role/auth (no real auth for hackathon)

## Design Tokens (from Pencil variables)

```css
/* Dark (default) */
--bg-primary: #0B0D0F;
--bg-surface: #141720;
--bg-card: #1E2235;
--bg-elevated: #252A3A;
--border: #2E3347;
--text-primary: #F1F5F9;
--text-secondary: #94A3B8;
--text-muted: #64748B;
--accent: #4F8EF7;
--grocery: #22C55E;
--medical: #60A5FA;
--emergency: #F43F5E;
--warning: #F59E0B;
--sidebar-bg: #080A0D;

/* Light */
--bg-primary: #FFFFFF;
--bg-surface: #F8FAFC;
--bg-card: #FFFFFF;
--bg-elevated: #FFFFFF;
--border: #E2E8F0;
--text-primary: #0F172A;
--text-secondary: #475569;
--text-muted: #94A3B8;
--sidebar-bg: #111827;
```

## Route Structure

| Screen | Route | Layout |
|--------|-------|--------|
| S1 Landing | `/` | Standalone |
| C1 Onboarding | `/onboarding/caretaker` | Standalone |
| C2 Dashboard | `/dashboard` | CaretakerLayout (sidebar) |
| C3 Groceries | `/dashboard/groceries` | CaretakerLayout |
| C4 Medical | `/dashboard/medical` | CaretakerLayout |
| C5 Alerts | `/dashboard/alerts` | CaretakerLayout |
| C6 Settings | `/dashboard/settings` | CaretakerLayout |
| P1 Patient Onboarding | `/onboarding/patient` | Standalone (mobile) |
| P2 Patient Home | `/patient` | Standalone (mobile) |
| P3 Patient Camera | `/camera/[domain]` | Standalone (mobile) — existing, upgrade UI |
| P4 Patient SOS | `/patient/sos` | Standalone (mobile) |

## Implementation Units

### Unit 1: Theme System + Design Tokens + Font Swap

**Goal:** Replace globals.css with the full dark/light token system. Add Funnel Sans font. Create ThemeProvider context.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/components/ThemeProvider.tsx`
- Create: `src/lib/theme.ts`

**Approach:**
- CSS custom properties under `html.dark` and `html.light` selectors
- Default to `dark`, read from `localStorage('aegis_theme')`
- Import `Funnel_Sans` from `next/font/google` alongside existing `Geist_Mono`
- ThemeProvider as a client component wrapping children in layout.tsx
- Body uses `bg-[var(--bg-primary)] text-[var(--text-primary)]` etc.

**Dependencies:** None

---

### Unit 2: Shared Caretaker Layout (Sidebar)

**Goal:** Create the sidebar layout used by C2–C6 with navigation, active state, elder profile.

**Files:**
- Create: `src/app/dashboard/layout.tsx`
- Create: `src/components/Sidebar.tsx`

**Approach:**
- 240px fixed sidebar (dark `--sidebar-bg`)
- Nav items: Dashboard, Groceries, Medical, Alerts, Settings with Lucide icons
- Active state derived from `usePathname()`
- Each active item uses the domain color (dashboard=accent, groceries=green, medical=blue, alerts=red, settings=accent)
- Bottom: elder avatar + name + status from `/api/status`
- Right side: `<main>` with `--bg-surface` background, full height
- Mobile: sidebar collapses to bottom tab bar

**Dependencies:** Unit 1

---

### Unit 3: S1 Landing Page

**Goal:** Replace the current debug `page.tsx` with the designed landing page.

**Files:**
- Modify: `src/app/page.tsx`

**Approach:**
- Standalone dark page (no sidebar)
- Navbar: Aegis logo + About + How it works + Sign In button
- Hero: badge ("HackPrinceton 2026") + "One Guardian, Three Promises." headline + subline
- Two role cards (Caretaker / Patient) with feature lists and CTA buttons
- Footer with copyright
- Caretaker card → `/onboarding/caretaker`, Patient card → `/onboarding/patient`
- Store role in localStorage on click

**Dependencies:** Unit 1

---

### Unit 4: Backend API — Status, Medical Schedule, Events Filter

**Goal:** Add the API routes needed by dashboard, medical, and alerts pages.

**Files:**
- Create: `src/app/api/status/route.ts`
- Create: `src/app/api/medical/schedule/route.ts`
- Modify: `src/app/api/events/route.ts` (add domain filter)
- Create: `src/app/api/settings/route.ts`
- Create: `src/app/api/emergency/sos/route.ts`

**Approach:**
- `GET /api/status`: compute from recent events — grocery/medical/emergency status objects
- `GET /api/medical/schedule`: read prescriptions.json, cross-reference events.json for today's adherence per med
- `GET /api/events?domain=X&limit=N`: extend existing route with domain filter
- `GET/POST /api/settings`: read/write `data/config.json` with fallback to .env
- `POST /api/emergency/sos`: log event + send iMessage immediately (no vision, no dedup)

**Dependencies:** None (uses existing lib/events.ts, lib/imessage.ts)

---

### Unit 5: C2 Caretaker Dashboard

**Goal:** Build the main monitoring dashboard matching the Pencil design.

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Modify: `src/components/StatusCards.tsx` (redesign to match tokens)
- Modify: `src/components/CameraPreview.tsx` (redesign)
- Modify: `src/components/EventLog.tsx` (redesign as "Recent Activity")

**Approach:**
- Top bar: greeting ("Good evening, Sarah.") + "System running" badge
- 3 status cards with domain-colored borders and large status text
- 3 camera preview cards with domain dot, label, timestamp, camera placeholder
- Recent Activity table: time (mono), domain badge (colored), message text
- All components use CSS variables, not hardcoded Tailwind colors
- Poll `/api/status` for card data, `/api/events` for activity feed, `/api/snapshot/latest/:domain` for cameras

**Dependencies:** Units 1, 2, 4

---

### Unit 6: C3 Groceries Page

**Goal:** Build the grocery monitoring page with shelf camera, vision analysis, and pending cart.

**Files:**
- Create: `src/app/dashboard/groceries/page.tsx`

**Approach:**
- Alert banner (green) when low supply detected
- Left column: camera preview card + vision analysis card (eye icon, analysis text)
- Right column: Pending Order card — item checklist with prices, total, Cancel/Approve buttons
- Polls `/api/grocery/cart` for cart state (new GET handler to add)
- Approve button POSTs to `/api/grocery/checkout`
- Reuse redesigned CameraPreview component

**Dependencies:** Units 1, 2, 4

---

### Unit 7: C4 Medical Page

**Goal:** Build the medication schedule page with today's timeline and camera preview.

**Files:**
- Create: `src/app/dashboard/medical/page.tsx`

**Approach:**
- Left: Schedule card with 3 medication rows (taken/due/upcoming states)
- Each row: status icon circle (green check / amber clock / gray clock), name, time, badge
- Right: Medicine Table Camera preview
- Top right: "Edit Schedule" button (future feature, disabled for hackathon)
- Fetches `/api/medical/schedule` for live adherence status

**Dependencies:** Units 1, 2, 4

---

### Unit 8: C5 Alerts Page

**Goal:** Build the filtered event history page.

**Files:**
- Create: `src/app/dashboard/alerts/page.tsx`

**Approach:**
- Filter pills: All, Emergency, Medical, Grocery (active state = accent bg)
- Event rows: timestamp (mono), domain badge (colored), title (bold) + description (muted)
- Emergency rows get faint red background tint
- Fetches `/api/events?domain=X&limit=50`
- Client-side filter switching re-fetches with domain param

**Dependencies:** Units 1, 2, 4

---

### Unit 9: C6 Settings Page

**Goal:** Build the settings configuration page.

**Files:**
- Create: `src/app/dashboard/settings/page.tsx`

**Approach:**
- Elder Profile card: name input, Knot external user ID (mono font)
- iMessage Chat IDs card: 3 inputs with domain-colored dots (grocery/medical/emergency)
- Theme toggle: dark/light switch
- Demo Controls: keep existing DemoControls but redesigned to match tokens
- Fetches `/api/settings`, saves on change

**Dependencies:** Units 1, 2, 4

---

### Unit 10: C1 Caretaker Onboarding (Camera Setup Step)

**Goal:** Build the onboarding wizard, showing Step 4 (camera setup with QR codes).

**Files:**
- Create: `src/app/onboarding/caretaker/page.tsx`

**Approach:**
- Multi-step wizard (show step 4 of 6 for demo)
- Progress bar at top (blue fill proportional to step)
- Title: "Set Up Your Cameras" + instructions
- 3 QR code cards: Grocery (green, "Connected"), Medical (blue, "Waiting"), Emergency (red, "Waiting")
- Each card: domain dot, label, QR placeholder, URL path in mono
- Back/Continue buttons at bottom
- Continue → `/dashboard`

**Dependencies:** Unit 1

---

### Unit 11: Patient Screens (P1, P2, P3 upgrade, P4)

**Goal:** Build all 4 patient-facing mobile screens.

**Files:**
- Create: `src/app/onboarding/patient/page.tsx` (P1)
- Create: `src/app/patient/page.tsx` (P2)
- Modify: `src/app/camera/[domain]/page.tsx` (P3 — UI upgrade)
- Create: `src/app/patient/sos/page.tsx` (P4)

**Approach:**
- **P1 Patient Onboarding:** Shield icon, "Welcome to Aegis", name input, "Get Started" button. Stores name in localStorage, navigates to `/patient`.
- **P2 Patient Home:** Status bar mock, shield icon + "All Good" badge, greeting with name + time-of-day, next medication card (blue border, pill icon, med name, instructions), SOS button (large red circle, phone icon), bottom camera status bar. Links to `/patient/sos` and `/camera/medical`.
- **P3 Camera (upgrade):** Keep existing CameraFeed logic. Add: back nav ("< Home"), LIVE badge (red), camera overlay (domain tag + time), TTS display card (blue border, speaker icon), "Next analysis in X min" status bar.
- **P4 Patient SOS:** Back to Home, "Emergency" title, "Press and hold for 3 seconds" instruction, large red SOS button with glow ring, "Hold for 3 seconds" label, "Call 911 directly" secondary button. Long-press handler POSTs to `/api/emergency/sos`.

**Dependencies:** Units 1, 4

---

## Build Order

```
Unit 1 (Theme) ──┐
                  ├── Unit 2 (Sidebar Layout)
                  │       ├── Unit 5 (Dashboard)
                  │       ├── Unit 6 (Groceries)
                  │       ├── Unit 7 (Medical)
                  │       ├── Unit 8 (Alerts)
                  │       └── Unit 9 (Settings)
                  ├── Unit 3 (Landing)
                  ├── Unit 10 (Onboarding)
                  └── Unit 11 (Patient Screens)
Unit 4 (Backend APIs) ── independent, can parallelize
```

## Parallelization Strategy

- **Wave 1:** Unit 1 (Theme) + Unit 4 (Backend APIs) — in parallel
- **Wave 2:** All remaining units — in parallel (all depend only on Unit 1 being done)
