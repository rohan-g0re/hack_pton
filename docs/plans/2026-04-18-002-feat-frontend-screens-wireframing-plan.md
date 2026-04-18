---
title: "Frontend Screens, Wireframing & Navigation Architecture"
type: feat
status: active
date: 2026-04-18
origin: docs/product_idea.md
---

# Frontend Screens, Wireframing & Navigation Architecture

## Overview

This plan is the exhaustive visual and structural blueprint for every screen, panel, modal, and navigation path in the Caretaker Command Center Next.js application. It is grounded solely in `docs/product_idea.md` — the full product vision, not the simplified demo plan. The product idea describes:

1. **A caretaker onboarding flow** where a caretaker registers, chooses device role (dashboard vs. nanny cam), and nanny cam devices generate QR codes for the caretaker to scan to bind the camera.
2. **A caretaker dashboard** showing live camera feeds, pantry inventory, medication schedule, purchase history, medication alerts, and card management per patient.
3. **Two nanny cam pages** (pantry and medicine) that capture snapshots every ~10 seconds and send them to the backend for Gemini ER analysis.
4. **A pantry management flow** where the caretaker edits what groceries the patient should have, and the system auto-orders via Knot API when stock is low.
5. **A medication adherence flow** where the system checks if the right pills were taken at the right time and alerts the caretaker via Photon iMessage and the dashboard.
6. **Card/payment setup** where the caretaker adds a payment card per patient for Knot-powered grocery orders.

The app is a Next.js web frontend — it works on phones, tablets, and laptops. Any device's camera can serve as a nanny cam.

## Problem Frame

The product idea requires a web-based service for caretakers of elderly patients. Caretakers cannot be physically present 24/7 but want live awareness of pantry status and medication adherence through nanny cam monitoring. The frontend must serve three distinct device roles — caretaker dashboard, pantry nanny cam, and medicine nanny cam — all from the same URL with a role-selection entry point. The dashboard must show live data, accept edits to inventory and prescriptions, manage payment cards, display purchase proposals with approval gates, and surface medication alerts alongside their Photon iMessage delivery status.

## Requirements Trace (from product_idea.md)

- R1. Caretaker can register and add cameras to surveillance
- R2. Device role selection: "Caretaker Dashboard" or "Nanny Cam" (pantry/medicine)
- R3. Nanny cam generates QR code; caretaker scans it to bind camera; live feed visible on dashboard
- R4. Snapshots taken at ~10s intervals from nanny cam pages, sent to backend
- R5. Caretaker can edit the inventory list (name and quantity) for the patient
- R6. Caretaker can view and edit the prescription list (medicine name, timing, quantity, purpose)
- R7. When Gemini detects low stock, a replenishment action is triggered; result shows on dashboard
- R8. When Gemini detects medication taken/not-taken, result shows on dashboard as notification
- R9. Caretaker can add a payment card per patient (via Knot vaulting SDK)
- R10. Transaction success/failure appears on the caretaker dashboard
- R11. Photon iMessage alerts also appear on the dashboard
- R12. Dashboard updates are event-triggered, not continuous polling — updates only when something happens

---

## Screen Inventory

The application has **9 distinct screens** organized into 4 logical groups:

| # | Screen | Route | Group | Purpose |
|---|--------|-------|-------|---------|
| S1 | Welcome / Role Selector | `/` | Onboarding | Choose "Caretaker Dashboard" or "Nanny Cam" |
| S2 | Caretaker Registration | `/register` | Onboarding | Register caretaker: name, phone, patient name, relationship |
| S3 | QR Code Bind | `/bind` | Onboarding | Nanny cam shows QR; caretaker scans to bind camera to their account |
| S4 | Caretaker Dashboard | `/dashboard` | Dashboard | Main command center: live feeds, inventory, prescriptions, proposals, alerts |
| S5 | Patient Settings | `/dashboard/patient` | Dashboard | Edit inventory, prescriptions, and payment card for the patient |
| S6 | Proposal Detail | `/dashboard/proposals/[id]` | Dashboard | Full view of a purchase proposal with approve/reject and checkout result |
| S7 | Camera Role Selector | `/camera` | Camera | Pick pantry or medicine role for this device |
| S8 | Pantry Nanny Cam | `/camera/pantry` | Camera | Live preview + 10s auto-snapshot for pantry |
| S9 | Medicine Nanny Cam | `/camera/medicine` | Camera | Live preview + 10s auto-snapshot for medicine table |

---

## Navigation Map

```
                    ┌─────────────────────────┐
                    │   S1: Welcome /          │
                    │   Role Selector          │
                    │   Route: /               │
                    └────────┬─────────────────┘
                             │
               ┌─────────────┴──────────────────┐
               ▼                                 ▼
    ┌───────────────────┐             ┌──────────────────────┐
    │  S2: Caretaker    │             │  S7: Camera Role     │
    │  Registration     │             │  Selector            │
    │  Route: /register │             │  Route: /camera      │
    └────────┬──────────┘             └────────┬─────────────┘
             │                                 │
             ▼                       ┌─────────┴──────────┐
    ┌───────────────────┐            ▼                    ▼
    │  S4: Caretaker    │     ┌────────────┐    ┌─────────────┐
    │  Dashboard        │     │ S8: Pantry │    │ S9: Medicine│
    │  Route:           │     │ Nanny Cam  │    │ Nanny Cam   │
    │  /dashboard       │     │ /camera/   │    │ /camera/    │
    └──┬──────┬─────────┘     │ pantry     │    │ medicine    │
       │      │               └─────┬──────┘    └──────┬──────┘
       │      │                     │                  │
       │      │                     └──────┬───────────┘
       │      │                            ▼
       │      │                  ┌──────────────────┐
       │      │                  │  S3: QR Code     │
       │      │                  │  Bind            │
       │      │                  │  Route: /bind    │
       │      │                  └──────────────────┘
       │      │
       │      ▼
       │   ┌───────────────────┐
       │   │  S5: Patient      │
       │   │  Settings         │
       │   │  /dashboard/      │
       │   │  patient          │
       │   └───────────────────┘
       │
       ▼
    ┌───────────────────┐
    │  S6: Proposal     │
    │  Detail           │
    │  /dashboard/      │
    │  proposals/[id]   │
    └───────────────────┘
```

**Cross-links:**
- S4 (Dashboard) has links to S8 and S9 via camera status cards
- S8 and S9 link back to S4
- S4 links to S5 (Patient Settings) and S6 (Proposal Detail)
- S3 (QR Bind) is shown on nanny cam devices after role selection; caretaker scans the QR from their dashboard device
- S4 has a "Reset Demo" action for hackathon judging

---

## Screen-by-Screen Wireframe Specifications

### S1: Welcome / Role Selector

**Route:** `/`

**Purpose:** First-touch page. Every device that opens the URL sees this. The user chooses their device role: "I'm the Caretaker" (opens dashboard path) or "This is a Nanny Cam" (opens camera path). As described in product_idea.md: "on the sign up we can ask for every device, how is it going to be used."

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│                                                       │
│   EYEBROW: Hack Princeton 2026                       │
│   TITLE: Caretaker Command Center                    │
│   SUBTITLE: Remote pantry monitoring and medication  │
│   adherence for elderly family members.              │
│                                                       │
│   ┌────────────────────┐  ┌────────────────────────┐ │
│   │                    │  │                        │ │
│   │  [Dashboard icon]  │  │  [Camera icon]         │ │
│   │                    │  │                        │ │
│   │  "I'm the          │  │  "This device is       │ │
│   │   Caretaker"       │  │   a Nanny Cam"         │ │
│   │                    │  │                        │ │
│   │  Monitor your      │  │  Set up this phone     │ │
│   │  patient's pantry  │  │  or laptop as a        │ │
│   │  and medication    │  │  pantry or medicine     │ │
│   │  from anywhere.    │  │  camera.               │ │
│   │                    │  │                        │ │
│   │  [Get Started →]   │  │  [Set Up Cam →]        │ │
│   │                    │  │                        │ │
│   └────────────────────┘  └────────────────────────┘ │
│                                                       │
│   Built with Gemini ER 1.6 · Knot API · Photon ·    │
│   Supabase · AWS                                      │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Interactions:**
- "Get Started" → navigates to `/register`
- "Set Up Cam" → navigates to `/camera`
- Desktop: two cards side-by-side; Mobile: stacked vertically

---

### S2: Caretaker Registration

**Route:** `/register`

**Purpose:** Light signup (no real auth per product_idea.md: "I don't think I need any type of sign-ins"). Captures caretaker name, caretaker phone number (needed for Photon iMessage delivery), patient name, and relationship label.

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│  ← Back to home                                      │
│                                                       │
│  TITLE: Register as Caretaker                        │
│  SUBTITLE: Set up your household to begin            │
│  monitoring your patient.                            │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │  PANEL: Caretaker Details                        │ │
│  │                                                   │ │
│  │  Your Name:         [Rohan Shah            ]     │ │
│  │  Your Phone Number: [+1 609-555-0144       ]     │ │
│  │    (Used for iMessage medication alerts)          │ │
│  │                                                   │ │
│  │  Patient Name:      [Mira Shah             ]     │ │
│  │  Relationship:      [Grandmother ▼]              │ │
│  │                                                   │ │
│  │  [ Continue to Dashboard → ]                     │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Interactions:**
- On submit → writes caretaker + patient to Supabase → redirect to `/dashboard`
- Phone number is required (Photon needs the caretaker's phone to deliver iMessages)

---

### S3: QR Code Bind

**Route:** `/bind`

**Purpose:** As described in product_idea.md: "if we see it is a nanny cam then it generates a QR code that the caretaker is supposed to scan. When the caretaker scans it, the nanny cam's camera would start recording and the recording can be seen live on the caretaker's dashboard."

This page is shown on the nanny cam device AFTER it selects a camera role (S7 → S8/S9). The nanny cam device displays a QR code containing a binding token. The caretaker scans this QR code with their phone camera (or the dashboard has a "Scan QR" button that uses the laptop camera). Once scanned and bound, the nanny cam begins sending snapshots.

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│                                                       │
│  TITLE: Bind This Camera                             │
│  SUBTITLE: Show this QR code to the caretaker.       │
│  They scan it from their dashboard to connect         │
│  this camera.                                        │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │                                                   │ │
│  │               ┌──────────────┐                   │ │
│  │               │              │                   │ │
│  │               │   QR CODE    │                   │ │
│  │               │   (binding   │                   │ │
│  │               │   token)     │                   │ │
│  │               │              │                   │ │
│  │               └──────────────┘                   │ │
│  │                                                   │ │
│  │  Camera role: [Pantry Nanny Cam]                 │ │
│  │  Status: Waiting for caretaker to scan...        │ │
│  │                                                   │ │
│  │  [Skip for Demo →]                               │ │
│  │  (Bypasses QR and auto-binds for hackathon)      │ │
│  │                                                   │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Interactions:**
- QR code encodes: `{ cameraId, role, bindToken }`
- When caretaker scans → `POST /api/cameras/bind` → camera status changes to "online"
- The nanny cam page polls for bind confirmation, then auto-redirects to S8 or S9
- "Skip for Demo" bypasses QR and auto-binds (for hackathon judging convenience)

---

### S4: Caretaker Dashboard (Main Command Center)

**Route:** `/dashboard`

**Purpose:** The primary screen the caretaker watches. Shows live camera feeds, pantry inventory status, medication adherence status, purchase proposals, payment card status, and event/notification history. Per product_idea.md: "caretaker will have both the cams for that patient" and events update "only when it actually has taken place" (event-triggered, not continuous polling).

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER                                                              │
│  ┌──────────────────────────────────────┐  ┌───────────────────────┐ │
│  │  EYEBROW: Hack Princeton 2026       │  │ [Reset Demo]          │ │
│  │  TITLE: Caretaker Command Center    │  │ [Open Pantry Cam]     │ │
│  │  SUBTITLE: Monitoring Mira Shah     │  │ [Open Medicine Cam]   │ │
│  │  (Grandmother)                      │  │ [Patient Settings]    │ │
│  └──────────────────────────────────────┘  └───────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ROW 1: Two half-width panels                                        │
│  ┌───────────────────────────┐  ┌────────────────────────────────┐   │
│  │  PANEL A: Profile &       │  │  PANEL B: Camera Status        │   │
│  │  Payment Summary          │  │                                │   │
│  │                           │  │  ┌────────────────────────┐    │   │
│  │  Caretaker: Rohan Shah    │  │  │  Pantry Nanny Cam      │    │   │
│  │  Phone: +1 609-555-0144   │  │  │  Device: Kitchen iPhone│    │   │
│  │                           │  │  │  Status: [●] online     │    │   │
│  │  Patient: Mira Shah       │  │  │  Last snapshot: 2:14 PM│    │   │
│  │  Relationship: Grandmother│  │  │  [Open Cam →]           │    │   │
│  │                           │  │  ├────────────────────────┤    │   │
│  │  Payment Card:            │  │  │  Medicine Nanny Cam    │    │   │
│  │  VISA ending 4242         │  │  │  Device: Laptop Cam    │    │   │
│  │  [Edit Card →]            │  │  │  Status: [●] online     │    │   │
│  │                           │  │  │  Last snapshot: 2:12 PM│    │   │
│  │  [Edit Profile]           │  │  │  [Open Cam →]           │    │   │
│  │  [Scan Nanny Cam QR]      │  │  └────────────────────────┘    │   │
│  └───────────────────────────┘  └────────────────────────────────┘   │
│                                                                       │
│  ROW 2: Full-width panel                                             │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  PANEL C: Pantry Inventory                       [Edit Items →] │ │
│  │  ┌──────────┬──────────┬────────────┬───────────────────┐       │ │
│  │  │  Item    │ Target   │ Low-stock  │ Preferred         │       │ │
│  │  │          │ Qty      │ Threshold  │ Merchant          │       │ │
│  │  ├──────────┼──────────┼────────────┼───────────────────┤       │ │
│  │  │  Milk    │ 2        │ 1          │ Walmart           │       │ │
│  │  │  Bananas │ 6        │ 2          │ Walmart           │       │ │
│  │  │  Oatmeal │ 2        │ 1          │ Walmart           │       │ │
│  │  │  Apples  │ 5        │ 2          │ Walmart           │       │ │
│  │  └──────────┴──────────┴────────────┴───────────────────┘       │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ROW 3: Full-width panel                                             │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  PANEL D: Medication Schedule                    [Edit Meds →]  │ │
│  │  ┌──────────────┬───────┬──────────┬─────────┬────────────────┐ │ │
│  │  │  Medicine    │ Count │ Time     │ Window  │ Purpose        │ │ │
│  │  ├──────────────┼───────┼──────────┼─────────┼────────────────┤ │ │
│  │  │  Allergy     │ 1     │ 14:00    │ 30 min  │ Seasonal       │ │ │
│  │  │  Relief      │       │          │         │ allergy        │ │ │
│  │  │  Vitamin D   │ 1     │ 14:00    │ 30 min  │ Daily vitamin  │ │ │
│  │  └──────────────┴───────┴──────────┴─────────┴────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ROW 4: Full-width panel                                             │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  PANEL E: Purchase Proposals                  [Approval Required]│ │
│  │                                                                   │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Walmart Grocery Order                                       │ │ │
│  │  │  Items: Milk x2, Bananas x5, Oatmeal x2                     │ │ │
│  │  │  Gemini confidence: 91%    Est. total: $38.25                │ │ │
│  │  │  Status: [awaiting approval]                                  │ │ │
│  │  │                                                              │ │ │
│  │  │  [Approve & Order via Knot]  [Reject]  [View Details →]      │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ROW 5: Full-width panel                                             │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  PANEL F: Event & Notification Feed                              │ │
│  │                                                                   │ │
│  │  [success] Medication taken correctly                   2:14 PM  │ │
│  │  All scheduled medicines taken. Sent via Photon iMessage.        │ │
│  │  ─────────────────────────────────────────────────────────────── │ │
│  │  [critical] Medication alert                            2:10 PM  │ │
│  │  Missed medication. Alert sent via Photon iMessage to            │ │
│  │  +1 609-555-0144.                                                │ │
│  │  ─────────────────────────────────────────────────────────────── │ │
│  │  [success] Grocery order placed                         2:08 PM  │ │
│  │  Knot checkout for Milk, Bananas, Oatmeal on Walmart.            │ │
│  │  ─────────────────────────────────────────────────────────────── │ │
│  │  [warning] Low stock detected                           2:05 PM  │ │
│  │  Gemini detected low pantry stock. Proposal created.             │ │
│  │  ─────────────────────────────────────────────────────────────── │ │
│  │  [info] System ready                                    2:00 PM  │ │
│  │  Dashboard initialized for Rohan Shah monitoring Mira Shah.      │ │
│  │                                                                   │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Panels breakdown:**

| Panel | Content | Editable? | Data source |
|-------|---------|-----------|-------------|
| A | Caretaker + patient profile, payment card summary, QR scan button | Profile: yes (links to S5). Card: links to S5 Knot SDK. QR: opens camera for scanning. | `caretakers`, `patients`, `payment_cards` tables |
| B | Camera status cards with online/offline/stale states, last snapshot time, device name | Read-only | `cameras` table |
| C | Pantry inventory as read-only table; "Edit Items" links to S5 | Read-only on dashboard; editable in S5 | `inventory_items` table |
| D | Medication schedule as read-only table; "Edit Meds" links to S5 | Read-only on dashboard; editable in S5 | `prescriptions` table |
| E | Purchase proposal cards with approve/reject actions | Yes (approve/reject buttons) | `purchase_proposals` table |
| F | Chronological event feed showing pantry, medication, checkout, and system events with Photon delivery status | Read-only | `events`, `notifications` tables |

**Key interactions:**
- "Approve & Order via Knot" → `POST /api/proposals/:id/approve` → triggers Knot checkout on backend → success/failure event appears in Panel F
- "Reject" → `POST /api/proposals/:id/reject`
- "View Details" → navigates to S6
- "Edit Items" / "Edit Meds" / "Edit Card" → navigates to S5
- "Scan Nanny Cam QR" → opens device camera to scan QR from nanny cam device (S3)
- "Open Cam" links in Panel B → opens S8 or S9 in new tab
- "Reset Demo" → `POST /api/demo/reset`

**Update mechanism (from product_idea.md):**
Per the product idea: "it only updates on the UI when it actually has taken place." The dashboard should use event-driven updates (Supabase Realtime subscriptions or SSE from the backend), not 3-second polling. When a new event is written to Supabase by the worker, the dashboard receives it in real time.

---

### S5: Patient Settings

**Route:** `/dashboard/patient`

**Purpose:** Dedicated settings page where the caretaker edits: the pantry inventory list (name and quantity per product_idea.md), the medication prescription list, and the payment card for this patient (via Knot vaulting SDK embed). Separated from the dashboard to keep the dashboard clean for judging.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                                 │
│                                                                       │
│  TITLE: Settings for Mira Shah                                       │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  SECTION A: Pantry Inventory                                     │ │
│  │  "What groceries should the patient have?"                       │ │
│  │                                                                   │ │
│  │  ┌──────────┬──────────┬────────────┬───────────────────┐        │ │
│  │  │  Item    │ Target   │ Low-stock  │ Merchant          │        │ │
│  │  │          │ Qty      │ Threshold  │                   │        │ │
│  │  ├──────────┼──────────┼────────────┼───────────────────┤        │ │
│  │  │  [Milk]  │ [2]      │ [1]        │ [Walmart]         │  [×]  │ │
│  │  │  [Banana]│ [6]      │ [2]        │ [Walmart]         │  [×]  │ │
│  │  │  [Oatmel]│ [2]      │ [1]        │ [Walmart]         │  [×]  │ │
│  │  │  [Apple] │ [5]      │ [2]        │ [Walmart]         │  [×]  │ │
│  │  └──────────┴──────────┴────────────┴───────────────────┘        │ │
│  │  [+ Add Item]                                                     │ │
│  │  [Save Inventory]                                                 │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  SECTION B: Medication Schedule                                   │ │
│  │  "What medicines should the patient take?"                        │ │
│  │                                                                   │ │
│  │  ┌────────────┬───────┬──────────┬─────────┬──────────────┐      │ │
│  │  │  Medicine  │ Count │ Time     │ Window  │ Purpose      │      │ │
│  │  ├────────────┼───────┼──────────┼─────────┼──────────────┤      │ │
│  │  │  [Allergy] │ [1]   │ [14:00]  │ [30]min │ [Seasonal..] │ [×] │ │
│  │  │  [Vit D]   │ [1]   │ [14:00]  │ [30]min │ [Daily vit]  │ [×] │ │
│  │  └────────────┴───────┴──────────┴─────────┴──────────────┘      │ │
│  │  [+ Add Medication]                                               │ │
│  │  [Save Prescriptions]                                             │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  SECTION C: Payment Card                                         │ │
│  │  "Card used for grocery orders via Knot"                         │ │
│  │                                                                   │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Current card: VISA ending 4242                              │ │ │
│  │  │  Status: Active                                              │ │ │
│  │  │                                                              │ │ │
│  │  │  [Update Card]                                               │ │ │
│  │  │  (Opens Knot Vaulting SDK embed)                             │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  Per product_idea.md: "for every patient they can set a          │ │
│  │  different card and that card will be used for that given         │ │
│  │  patient's all the purchases"                                    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Interactions:**
- Save Inventory → `POST /api/inventory`
- Save Prescriptions → `POST /api/prescriptions`
- Update Card → opens Knot Vaulting SDK embedded component to securely capture card details
- [×] buttons delete rows
- [+ Add] buttons append blank editable rows

---

### S6: Proposal Detail

**Route:** `/dashboard/proposals/[id]`

**Purpose:** Full-screen view of a purchase proposal. Shows the Gemini analysis that triggered it, the item list, confidence score, estimated total, and large approve/reject buttons. After approval, shows the Knot checkout result.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                                 │
│                                                                       │
│  TITLE: Purchase Proposal                                            │
│  STATUS: [awaiting approval]                                         │
│  Merchant: Walmart  |  Created: Apr 18, 2026, 2:05 PM               │
│                                                                       │
│  ┌───────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  PANEL: Items         │  │  PANEL: Gemini Analysis              │ │
│  │                       │  │                                      │ │
│  │  Item     Qty   Est$  │  │  Model: Gemini ER Robotics 1.6      │ │
│  │  ─────────────────── │  │  Confidence: 91%                     │ │
│  │  Milk      2    $8.50 │  │  ████████████████░░░░  91%           │ │
│  │  Bananas   5   $21.25 │  │                                      │ │
│  │  Oatmeal   2    $8.50 │  │  Scene detected:                    │ │
│  │  ─────────────────── │  │  - Milk: 0 visible (threshold: 1)   │ │
│  │  TOTAL:       $38.25  │  │  - Bananas: 1 visible (threshold: 2)│ │
│  │                       │  │  - Oatmeal: 0 visible (threshold: 1)│ │
│  └───────────────────────┘  └──────────────────────────────────────┘ │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  [████ Approve & Order via Knot on Walmart ████]                 │ │
│  │  [Reject Proposal]                                                │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  PANEL: Checkout Result (shown after approval)                    │ │
│  │  Provider: Knot API → Walmart                                     │ │
│  │  Card used: VISA ending 4242                                      │ │
│  │  Status: [success]                                                │ │
│  │  Completed: Apr 18, 2026, 2:08 PM                                 │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

### S7: Camera Role Selector

**Route:** `/camera`

**Purpose:** When a device is designated as a nanny cam, the user picks which role: pantry or medicine.

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│  ← Back to home                                      │
│                                                       │
│  TITLE: Set Up Nanny Cam                             │
│  SUBTITLE: Choose which area this device monitors.   │
│                                                       │
│  ┌────────────────────┐  ┌────────────────────────┐  │
│  │                    │  │                        │  │
│  │  "Nanny Pantry     │  │  "Nanny Medicine       │  │
│  │   Cam"             │  │   Cam"                 │  │
│  │                    │  │                        │  │
│  │  Place in front    │  │  Point at the          │  │
│  │  of the pantry     │  │  medicine table        │  │
│  │  shelves.          │  │  where pills are.      │  │
│  │                    │  │                        │  │
│  │  [Start Pantry →]  │  │  [Start Medicine →]    │  │
│  │                    │  │                        │  │
│  └────────────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

### S8: Pantry Nanny Cam

**Route:** `/camera/pantry`

**Purpose:** The page running on the device that serves as the pantry nanny cam. Per product_idea.md: "We want to take 10 seconds of snapshots from that camera" and send to the Gemini module. Shows live camera preview via `getUserMedia`, auto-captures snapshots every ~10 seconds, and sends them to the backend.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER                                                              │
│  EYEBROW: Nanny Cam Active                                          │
│  TITLE: Pantry Nanny Cam                                            │
│  SUBTITLE: Capturing snapshots every 10 seconds.     [← Dashboard]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────┐  ┌────────────────────────────────┐   │
│  │  PANEL: Device Setup      │  │  PANEL: Live Camera Preview    │   │
│  │                           │  │                                │   │
│  │  Role: [pantry]           │  │  ┌────────────────────────┐    │   │
│  │                           │  │  │                        │    │   │
│  │  Device name:             │  │  │   Live camera feed     │    │   │
│  │  [Kitchen iPhone    ]     │  │  │   from getUserMedia    │    │   │
│  │                           │  │  │                        │    │   │
│  │  [Register Device]        │  │  │   (or "Camera access   │    │   │
│  │                           │  │  │   denied" fallback)    │    │   │
│  │  Status: Registered ✓     │  │  │                        │    │   │
│  │                           │  │  └────────────────────────┘    │   │
│  └───────────────────────────┘  └────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  PANEL: Snapshot Controls                                         │ │
│  │                                                                   │ │
│  │  Auto-capture: [● Active - every 10 seconds]                     │ │
│  │  Snapshots sent: 14                                               │ │
│  │  Last sent: 2:14:30 PM                                            │ │
│  │                                                                   │ │
│  │  [Send Snapshot Now]  [Stop Auto Mode]                            │ │
│  │                                                                   │ │
│  │  Demo scene override (for hackathon):                             │ │
│  │  [Healthy pantry ▼]                                               │ │
│  │  "All major grocery items are clearly visible."                   │ │
│  │                                                                   │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Last response from server:                                  │ │ │
│  │  │  { "analysis": {...}, "proposal": {...} }                    │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Key behaviors:**
- On page load, requests camera permission via `getUserMedia({ video: true })`
- After registration, auto-starts 10-second snapshot interval
- Each snapshot: captures frame from video element → sends to `POST /api/cameras/pantry/snapshot`
- In production: sends actual image data. For hackathon demo: sends scene ID (simulated Gemini output)
- "Demo scene override" dropdown available during judging to simulate different pantry states
- Shows last server response (analysis result + proposal if created)

---

### S9: Medicine Nanny Cam

**Route:** `/camera/medicine`

**Purpose:** Identical structure to S8 but for the medicine table camera. Per product_idea.md: "pointed downwards towards their table" to watch pill packages. Same 10-second auto-capture, same registration flow. The medicine module on the backend fires "around the time when the tablet is to be taken."

**Demo scene options:**
1. "Taken correctly" — Both medicines taken in correct count
2. "Missed medication" — No tablets taken
3. "Wrong medicine" — Different pill taken
4. "Uncertain detection" — Low confidence / obscured view

---

## User Flow Diagrams

### Flow 1: Caretaker First-Time Setup

```
Caretaker device → S1 (Welcome)
  → "I'm the Caretaker" → S2 (Register)
    → Enters name, phone, patient name → Submit
      → S4 (Dashboard) — empty state, cameras offline
        → "Scan Nanny Cam QR" to bind cameras
```

### Flow 2: Nanny Cam Device Setup (with QR binding from product_idea.md)

```
Nanny cam device → S1 (Welcome)
  → "This device is a Nanny Cam" → S7 (Role Selector)
    → "Pantry Cam" → S3 (QR Code Bind)
      → Device shows QR code on screen
      → Caretaker scans QR from dashboard (S4, Panel A "Scan QR")
        → Camera binds to caretaker's account
        → S3 auto-redirects to S8 (Pantry Nanny Cam)
          → Auto-starts 10s snapshots
```

### Flow 3: Pantry Low-Stock → Gemini → Knot Order (from product_idea.md)

```
S8 (Pantry Cam): 10s snapshot auto-sent to backend
  → Backend: Gemini ER 1.6 analyzes image
  → Gemini compares visible items vs inventory list from Supabase
  → Detects low stock → generates replenishment list
  → Writes purchase_proposal to Supabase
  → S4 (Dashboard): Panel E shows new proposal (event-triggered update)
    → Caretaker clicks "Approve & Order via Knot"
      → Backend: Knot API places order on Walmart using patient's card
      → Success event written to Supabase
      → S4: Panel F shows "Grocery order placed" event
```

### Flow 4: Medication Adherence → Gemini → Photon iMessage (from product_idea.md)

```
S9 (Medicine Cam): snapshot sent around scheduled pill time
  → Backend: Gemini ER 1.6 checks visible pills vs prescription
  → Determines: correct medicine? correct count? within time window?
  → IF yes: writes success event → Photon sends "taken correctly" iMessage
  → IF no:  writes alert event  → Photon sends "missed medication" alert
  → Both: event appears in S4 Panel F with Photon delivery status
```

### Flow 5: Full Judge Demo Narrative (End-to-End)

```
1.  Laptop A (judge): S1 → S2 → S4 (Dashboard)
2.  Phone B: S1 → S7 → "Pantry" → S3 (QR displayed)
3.  Laptop A: "Scan QR" → binds pantry cam → S4 shows pantry online
4.  Phone C: S1 → S7 → "Medicine" → S3 (QR displayed)
5.  Laptop A: "Scan QR" → binds medicine cam → S4 shows both online
6.  Phone B auto-captures snapshots → S4 shows "Pantry looks healthy"
7.  Phone B switches to "Low stock" scene → S4 shows purchase proposal
8.  Judge approves on S4 → Knot checkout → success event in feed
9.  Phone C sends "Taken correctly" → success event + iMessage confirmation
10. Phone C sends "Missed medication" → critical alert + iMessage alert
11. Judge sees complete story on S4 dashboard
```

---

## Component Hierarchy (Next.js App Router)

```
apps/web/
├── app/
│   ├── layout.tsx              (root layout, global CSS, fonts)
│   ├── page.tsx                (S1: Welcome / Role Selector)
│   ├── register/
│   │   └── page.tsx            (S2: Caretaker Registration)
│   ├── bind/
│   │   └── page.tsx            (S3: QR Code Bind)
│   ├── dashboard/
│   │   ├── layout.tsx          (dashboard shell, realtime subscription)
│   │   ├── page.tsx            (S4: Main Dashboard)
│   │   ├── patient/
│   │   │   └── page.tsx        (S5: Patient Settings)
│   │   └── proposals/
│   │       └── [id]/
│   │           └── page.tsx    (S6: Proposal Detail)
│   └── camera/
│       ├── page.tsx            (S7: Camera Role Selector)
│       ├── pantry/
│       │   └── page.tsx        (S8: Pantry Nanny Cam)
│       └── medicine/
│           └── page.tsx        (S9: Medicine Nanny Cam)
├── components/
│   ├── ui/
│   │   ├── StatusPill.tsx      (colored status badge)
│   │   ├── Panel.tsx           (glass-morphism card container)
│   │   ├── Card.tsx            (inner card for list items)
│   │   ├── Button.tsx          (primary/secondary button)
│   │   ├── BackLink.tsx        (← navigation link)
│   │   ├── RoleCard.tsx        (large selectable card for S1, S7)
│   │   ├── Toast.tsx           (brief success/error notification)
│   │   └── QRCode.tsx          (QR code display for S3)
│   ├── dashboard/
│   │   ├── ProfilePanel.tsx    (Panel A: profile + card + QR scan)
│   │   ├── CameraStatusPanel.tsx (Panel B: camera cards)
│   │   ├── InventoryPanel.tsx  (Panel C: read-only inventory)
│   │   ├── PrescriptionPanel.tsx (Panel D: read-only prescriptions)
│   │   ├── ProposalList.tsx    (Panel E: proposal cards)
│   │   ├── ProposalCard.tsx    (single proposal with actions)
│   │   └── EventFeed.tsx       (Panel F: event timeline)
│   ├── settings/
│   │   ├── InventoryEditor.tsx (editable inventory table in S5)
│   │   ├── PrescriptionEditor.tsx (editable rx table in S5)
│   │   └── KnotCardEmbed.tsx   (Knot vaulting SDK embed in S5)
│   ├── camera/
│   │   ├── DeviceRegistration.tsx (register form + status)
│   │   ├── LivePreview.tsx     (getUserMedia video preview)
│   │   ├── SnapshotControls.tsx (manual + auto 10s controls)
│   │   └── DemoSceneSelector.tsx (hackathon demo scene override)
│   └── layout/
│       ├── HeroSection.tsx     (header with eyebrow + title)
│       ├── TechBadgeStrip.tsx  (sponsor tech logos)
│       └── PageShell.tsx       (max-width container)
└── lib/
    ├── api.ts                  (fetch wrapper for /api/* calls)
    ├── types.ts                (TypeScript interfaces for all state)
    ├── supabase.ts             (Supabase client + realtime subscription)
    └── qr.ts                   (QR generation and scanning helpers)
```

---

## Design Tokens (from existing `public/styles.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#f5efe2` | Page background |
| `--ink` | `#1f2721` | Primary text |
| `--ink-soft` | `#546056` | Secondary text |
| `--panel` | `rgba(255,252,246,0.85)` | Panel background with blur |
| `--accent` | `#17624d` | Primary buttons, success/online |
| `--accent-soft` | `#d8efe4` | Success pill backgrounds |
| `--alert` | `#b04a2d` | Critical/offline/error |
| `--warn` | `#b88116` | Warning/pending states |
| `--line` | `rgba(31,39,33,0.12)` | Borders |
| `--shadow` | `0 18px 45px rgba(38,41,31,0.12)` | Panel elevation |

**Typography:** Georgia serif body; system sans-serif for controls.
**Radius:** `24px` panels, `16px` inputs, `999px` pills/buttons.
**Breakpoints:** >900px = 2-column; <=900px = single column stack.

---

## Sources & References

- **Origin document:** [docs/product_idea.md](docs/product_idea.md)
- Existing CSS: `public/styles.css`
- Gemini ER docs: https://ai.google.dev/gemini-api/docs/robotics-overview
- Knot SDK: https://docs.knotapi.com/sdk/web
- Knot Vaulting: https://docs.knotapi.com/vaulting/quickstart
- Knot Shopping: https://docs.knotapi.com/shopping/quickstart
- Photon / spectrum-ts: https://docs.photon.codes/llms.txt
