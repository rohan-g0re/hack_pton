---
title: "feat: Full UI Redesign from Pencil Design + AWS Deploy"
type: feat
status: completed
date: 2026-04-19
origin: docs/plans/2026-04-19-011-feat-pencil-screen-redesign-plan.md
---

# Full UI Redesign from Pencil Design + AWS Deploy

## Overview

Rebuild every `public/*.html` screen and `public/styles.css` to match the white-majority healthcare visual system defined in `docs/design/main.pen` (S1–S10). The existing `.html` files keep their JS hooks and `id` attributes unchanged; only markup structure and CSS class names change. After the UI pass is done, deploy the updated app to the existing AWS infrastructure using WSL + AWS CLI via the already-written `scripts/deploy-all.sh`.

## Problem Frame

The current frontend uses a warm beige (`#f5efe2`) background, Georgia serif typography, heavy backdrop-blur panels with 24px radius, and a single-column layout on most screens. The Pencil design calls for a clean white surface (`#FFFFFF`), Inter/system-ui sans-serif, 1440px-wide three-column dashboard, crisp `#DCE5E1` borders (1px, no blur), and consistent top-bar navigation on all secondary pages. There is a 1:1 route-to-screen mapping; no new routes are needed.

## Requirements Trace

- R1. Replace the beige/warm color tokens with the Pencil design-token palette (white surface, #0B6B56 accent, #DCE5E1 lines).
- R2. Replace Georgia serif with a system sans-serif stack matching the Aptos/Inter direction in the design.
- R3. Rebuild `index.html` as a split hero + two role cards layout (S1).
- R4. Rebuild `register.html` as a two-column intro + form card layout (S2).
- R5. Rebuild `dashboard.html` as a three-column workspace: left 318px profile/pairing, center feed, right camera column (S3).
- R6. Rebuild `patient.html` as a two-column settings workspace with a sticky save button in the page header (S4).
- R7. Rebuild `camera-select.html` as a full-page card chooser (S5).
- R8. Rebuild `bind.html` as a two-column intro + pairing card layout (S6).
- R9. Rebuild `camera-room.html` as: status bar + full-width dark preview + three-panel controls tray (S7/S8).
- R10. Rebuild `proposal-detail.html` as a two-column proposal workspace (S9).
- R11. Keep all existing JS module `src` attributes, `id` bindings, and semantic element tags intact so no JS logic changes are required.
- R12. Deploy to existing AWS EC2 via `scripts/deploy-all.sh` over WSL + AWS CLI.

## Scope Boundaries

- No changes to any `public/*.js`, `src/*.mjs`, or server files.
- No new npm dependencies; CSS is hand-authored with no build step.
- No mobile-first breakpoint overhaul; the existing `@media (max-width: 900px)` block is updated to match the new column structure but mobile is not the primary target.
- No changes to `docs/design/main.pen` — that is the source, not the output.
- `public/camera-select.html` and `public/camera.html` (the legacy redirect) get markup only; no JS change.

## Context & Research

### Relevant Code and Patterns

- Design tokens (Pencil variables): `surface=#FFFFFF`, `surface-muted=#F8FAFA`, `canvas=#F5F8F7`, `ink=#10201B`, `ink-muted=#5F706A`, `accent=#0B6B56`, `accent-soft=#E7F5EF`, `line=#DCE5E1`, `danger=#B93B2D`, `danger-soft=#FDEDEA`, `warning=#A86E16`, `warning-soft=#FFF4D8`, `blue-soft=#EDF6FF`.
- S3 Dashboard frame: three children `NUyY7` (left 318px), `YrnLR` (center fill), `IMBET` (right 410px) inside `ZjdLm` horizontal frame.
- S7/S8 Camera frames: `wEAjU` status bar (68px) → `4RbrJ` dark preview (642px, `#0F1F1B` fill) → `2eBaW` controls tray (three panels: setup 330px, capture fill, server 360px).
- Top bar pattern (S2, S4–S6, S9): back button with border + route breadcrumb pill (`$blue-soft` background, border-radius 999px).
- Current `public/styles.css` — will be fully replaced in Unit 1.
- `public/dashboard.html` — current grid layout; becomes three-column flex.
- `public/camera-room.html` — currently two panels + one wide; becomes status bar + dark video block + tray.
- `infra/.instances.json` — has live EC2 IPs; `scripts/deploy-all.sh` reads it.
- `scripts/deploy-all.sh` → calls `deploy-web.sh` + `deploy-workers.sh`; runs rsync + pm2 reload over SSH.

### Institutional Learnings

- No `docs/solutions/` entries directly cover CSS design-system migrations in this repo.

### External References

- None needed; all design specs derive from `docs/design/main.pen` variables and frame layouts already read above.

## Key Technical Decisions

- **Flat CSS, no preprocessor**: All tokens stay as CSS custom properties on `:root`. No SASS/PostCSS introduced. Keeps the zero-build-step invariant.
- **Replace, not layer**: Delete the warm-token block wholesale and write a new `:root`; don't add overrides on top of stale values to avoid specificity drift.
- **Inter via system-ui stack**: Aptos is not a web-safe font. Use `"Inter", system-ui, -apple-system, Segoe UI, sans-serif`. This matches the Pencil design intent without adding a CDN dependency.
- **ID bindings are sacred**: Every `id="…"` in the HTML maps to a JS querySelector. Markup restructuring must not rename or remove IDs. Elements may be moved into new wrapper divs, but the JS-facing surface stays stable.
- **Three-column dashboard via CSS grid**: `grid-template-columns: 318px 1fr 410px` on `.dashboard-workspace`. Each column is a flex-column. Sections within columns use `gap`.
- **Camera preview dark block**: `<video>` lives inside a `background: #0F1F1B` frame div that is full-width, rounded corners. The preview and scene-response content sit inside.
- **Deploy via WSL**: `scripts/deploy-all.sh` already uses `rsync` + `ssh` and reads `infra/.instances.json`. No script changes needed; deployment unit is a shell execution step in WSL.

## Open Questions

### Resolved During Planning

- Should JS files change? No — all `id` attributes are preserved, JS logic is untouched.
- Can we reuse the existing deploy scripts? Yes — `scripts/deploy-all.sh` is idempotent and production-ready.
- What font? Inter via system-ui stack (Aptos not available as web font without CDN).
- Does `public/camera.html` need updating? It's a legacy redirect wrapper — update its minimal markup to match the new shell but it has no substantive content.

### Deferred to Implementation

- Exact px values for a few Pencil panels that show `fill_container` heights — implementer should use `flex: 1` / `min-height` and verify visually.
- Whether `public/camera-select.html` already links to the right routes — verify at runtime, not plan time.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**CSS token migration (Unit 1):**
```
Old (:root)          →  New (:root)
--bg: #f5efe2        →  --canvas: #F5F8F7
--panel: rgba(...)   →  --surface: #FFFFFF
--ink: #1f2721       →  --ink: #10201B
--ink-soft: #546056  →  --ink-muted: #5F706A
--accent: #17624d    →  --accent: #0B6B56
--accent-soft: ...   →  --accent-soft: #E7F5EF
--line: rgba(...)    →  --line: #DCE5E1
--alert: #b04a2d     →  --danger: #B93B2D
--warn: #b88116      →  --warning: #A86E16
(new)                →  --surface-muted: #F8FAFA
(new)                →  --blue-soft: #EDF6FF
```

**Dashboard three-column grid (Unit 3):**
```
.dashboard-workspace {
  display: grid;
  grid-template-columns: 318px 1fr 410px;
  gap: 20px;
  height: calc(100vh - header - padding);
}
```

**Camera screen structure (Unit 5):**
```
<body>
  .cam-shell (flex-column, padding 28px, gap 18px)
    .device-status-bar (flex-row space-between, 68px)
    .camera-preview-block (dark bg #0F1F1B, border-radius 22px, padding 24px)
      .video-top-bar (flex-row space-between)
      <video id="video-preview">
      .scene-response
    .controls-tray (flex-row, gap 16px)
      .setup-panel (width 330px)
      .capture-panel (flex: 1)
      .server-panel (width 360px)
```

**Top bar pattern (all secondary screens):**
```
<div class="top-bar">
  <a class="back-btn" href="…">← Back</a>
  <span class="route-pill">Route / Screen</span>
</div>
```

## Implementation Units

- [ ] **Unit 1: CSS Design System Overhaul**

**Goal:** Replace `public/styles.css` with the full Pencil token palette, updated typography, and all reusable component classes the redesigned HTML screens will use.

**Requirements:** R1, R2, R11

**Dependencies:** None

**Files:**
- Modify: `public/styles.css`

**Approach:**
- Delete the current `:root` warm-token block; write new block with Pencil variables (names above).
- Set `body { font-family: "Inter", system-ui, -apple-system, Segoe UI, sans-serif; background: var(--canvas); color: var(--ink); }`.
- Remove `backdrop-filter: blur` from `.panel` and `.card`; set `background: var(--surface)` with `border: 1px solid var(--line)`.
- Reduce `.panel` and `.card` `border-radius` from 24px to 16px to match Pencil frame `cornerRadius: 16`.
- Remove the warm radial gradient from `body`.
- Add `.top-bar` (flex, space-between, 52px height) and `.route-pill` (border-radius 999px, `background: var(--blue-soft)`).
- Add `.back-btn` (flex, border 1px var(--line), border-radius 8px, padding 10px 14px).
- Add `.dashboard-workspace` (CSS grid, three-column, `grid-template-columns: 318px 1fr 410px`).
- Add `.cam-shell`, `.device-status-bar`, `.camera-preview-block`, `.controls-tray`, `.setup-panel`, `.capture-panel`, `.server-panel`.
- Add `.two-col-layout` (flex-row, gap 56px) and `.form-card` (border, border-radius 18px, padding 28px, shadow).
- Update `.status-pill` colors to use new danger/warning/success tokens.
- Update `@media (max-width: 900px)` to stack `.dashboard-workspace` and `.controls-tray`.
- Remove `.camera-layout` and `.wide` grid-column hack (replaced by `.controls-tray` flex).

**Test scenarios:**
- Test expectation: none — CSS-only change with no runtime behavior. Visual verification via browser screenshot after each screen is rebuilt.

**Verification:**
- Body background is white/near-white, not beige.
- All `.panel` elements render with `#FFFFFF` background and no blur.
- Font renders as sans-serif.

---

- [ ] **Unit 2: Welcome and Registration Screens**

**Goal:** Rebuild `public/index.html` (S1) and `public/register.html` (S2) to match the split-layout Pencil frames.

**Requirements:** R3, R4, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `public/index.html`
- Modify: `public/register.html`

**Approach:**

*index.html (S1):*
- Replace `.page-shell.narrow` wrapper with a full `.page-shell` using vertical layout and `padding: 56px`.
- Add a `.top-nav` bar with brand name and nav links (patient, camera links) at the top.
- Replace `.welcome-header` + `.role-grid` with a two-section hero: left `.hero-copy` (flex-column, gap 22px, title + subtitle + actions) and right `.workflow-preview` (a decorative muted panel, border-radius 18px, height 560px, fill `$surface-muted`).
- Below the hero, render `.role-chooser` as two horizontally arranged cards (`.care-card` and `.cam-card`) matching the Pencil `careCard`/`camCard` pattern: border, border-radius 16px, padding 24px, gap 18px.
- Keep the `href="/register"` and `href="/camera"` links intact.
- Keep `.tech-strip` at the bottom.

*register.html (S2):*
- Add `.top-bar` with a back button (`href="/"`) and a route pill (`/register`).
- Replace the current single-column narrow shell with `.two-col-layout`: left `.intro` column (width 460px, gap 22px, headline + subtitle) and right `.form-card` (flex: 1, the existing `<form id="register-form">`).
- The form card gets `border-radius: 18px`, `padding: 28px`, `box-shadow`.
- All `<label>`, `<input>`, `<select>`, `<button>` inside the form keep their current structure; only wrapper classes change.

**Test scenarios:**
- Test expectation: none — markup-only changes, no JS behavior.

**Verification:**
- Welcome screen shows side-by-side hero (copy left, decorative preview right) at desktop width.
- Role chooser cards are horizontal and link correctly to `/register` and `/camera`.
- Register page shows two columns: intro text left, form card right.
- Back button navigates to `/`.

---

- [ ] **Unit 3: Dashboard Screen**

**Goal:** Rebuild `public/dashboard.html` (S3) as a three-column command center.

**Requirements:** R5, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `public/dashboard.html`

**Approach:**
- Replace the current `<header class="hero">` with a `.dashboard-header` (flex, space-between, 136px region) containing `.head-copy` (title + subtitle `id="dashboard-subtitle"`) and `.actions` (existing buttons: Reset Data, Open Pantry Cam, Open Medicine Cam, Patient Settings).
- Replace `<main class="grid dashboard-grid">` with `<main class="dashboard-workspace">` using `.left-col`, `.center-col`, `.right-col`.
- **Left column (318px):** Profile & payment panel (existing `id="profile-summary"`, pair form `id="pair-form"`, `id="pair-input"`, `id="pair-feedback"`).
- **Center column (flex: 1):** Two stacked wide panels: Pantry inventory table (`id="inventory-table"`, `id="inventory-body"`) and Medication schedule table (`id="prescription-table"`, `id="prescription-body"`). Below those: Purchase proposals panel (`id="proposal-list"`). Below: Event feed panel (`id="event-list"`).
- **Right column (410px):** Camera status panel (`id="camera-status"`, `id="live-indicator"`).
- Remove the `.wide` class usage — it is no longer needed with the three-column grid.
- Keep all existing `id` attributes exactly as-is.

**Test scenarios:**
- Test expectation: none — markup restructuring only.

**Verification:**
- Dashboard renders three columns at desktop width.
- Profile panel is in left column; tables and feeds are in center; camera status is right.
- All existing JS-driven content (profile summary, proposals, events) still renders because IDs are unchanged.

---

- [ ] **Unit 4: Patient Settings Screen**

**Goal:** Rebuild `public/patient.html` (S4) as a two-column settings workspace with header save button.

**Requirements:** R6, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `public/patient.html`

**Approach:**
- Add `.top-bar` with back button (`href="/dashboard"`) and route pill (`/settings`).
- Add `.settings-header` (flex, space-between, align-end): left `.head-copy` (`id="patient-title"`, subtitle), right `.save-all-btn` (accent button, `id` to be wired by JS or left as static).
- Replace single-column panels with `.settings-workspace` (flex-row, gap 22px): `.settings-left` (flex: 1) and `.settings-right` (width 600px).
- Move Pantry inventory and Medication schedule panels into `.settings-left`.
- Move Grocery ordering (Knot, `id="knot-merchant-list"`) and Payment card (`id="card-summary"`, `id="update-card"`) panels into `.settings-right`.
- All panel-internal content (inventory rows, prescription rows, action buttons) keeps current structure and IDs.

**Test scenarios:**
- Test expectation: none — markup restructuring only.

**Verification:**
- Patient settings shows two columns at desktop width.
- Save/action buttons still function (JS uses existing button IDs).
- Knot and payment panels appear in right column.

---

- [ ] **Unit 5: Camera Select, Bind, and Room Screens**

**Goal:** Rebuild `public/camera-select.html` (S5), `public/bind.html` (S6), and `public/camera-room.html` (S7/S8) to match the Pencil camera screen layouts.

**Requirements:** R7, R8, R9, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `public/camera-select.html`
- Modify: `public/bind.html`
- Modify: `public/camera-room.html`

**Approach:**

*camera-select.html (S5):*
- Replace current body with `.page-shell` (vertical layout, padding 56px, gap 32px).
- Add `.top-bar` with back button and route pill.
- Add `.cam-select-header` (vertical, gap 14px): eyebrow `DEVICE ROLE`, large headline "Which room should this device watch?", subtitle paragraph.
- Add `.role-chooser` (flex-row, gap 24px, height 430px): `.pantry-card` and `.medicine-card` (both `fill_container`, border-radius 18px, padding 28px, gap 18px). Each card is a link `<a>` to `/camera/pantry` and `/camera/medicine` respectively.
- Add a `.cam-footer` (border, border-radius 16px, padding 20px, flex-row, gap 18px) with a QR-code icon and copy text about camera pairing context.

*bind.html (S6):*
- Add `.top-bar` with brand name (left) and route pill (right).
- Replace single narrow panel with `.two-col-layout` (flex-row, gap 56px): `.intro` (width 470px, gap 20px — headline + subtitle + what the code does) and `.pairing-card` (flex: 1, border-radius 20px, padding 32px, shadow, contains `id="pair-code"`, QR details, `id="bind-status"`, `id="bind-role"`).
- Keep all existing IDs (`pair-code`, `qr-wrap`, `bind-role`, `bind-status`) exactly.

*camera-room.html (S7/S8):*
- Replace `.camera-shell` wrapper with `.cam-shell` (flex-column, padding 28px, gap 18px).
- Add `.device-status-bar` (flex-row, space-between, 68px): left `.identity` (eyebrow `id="cam-eyebrow"` + title `id="camera-title"`), right `.bar-right` (status pill `id="camera-role-badge"` + back link).
- Add `.camera-preview-block` (background `#0F1F1B`, border-radius 22px, padding 24px, flex-column, gap 18px, height 642px): contains `.video-top` (flex-row, space-between, "Live preview" label + "Browser" pill) + `<video id="video-preview">` (flex: 1, object-fit cover, border-radius 12px) + `.scene-response` (flex-column, gap 16px, `id="snapshot-result"` pre box styled as light overlay text area on dark).
- Add `.controls-tray` (flex-row, gap 16px, height fill): `.setup-panel` (width 330px, border, border-radius 16px, padding 18px — contains `id="register-form"`, `id="register-result"`), `.capture-panel` (flex: 1, same card style — contains snapshot controls: `id="send-snapshot"`, `id="toggle-auto"`, `id="snap-count"`, `id="last-sent"`, `id="auto-badge"`), `.server-panel` (width 360px, background `var(--accent-soft)`, border `#B7E2D2` — contains last server response).
- Remove the old `.camera-layout`, `.panel.wide` structure; replace entirely with new layout.
- Keep camera HTTPS notice as a small muted paragraph inside `.camera-preview-block`.

**Test scenarios:**
- Test expectation: none — markup-only changes.

**Verification:**
- Camera select shows two full-height role cards side by side.
- Bind screen shows intro copy left + pairing card right; `id="pair-code"` still displays correctly.
- Camera room shows dark preview block filling most of the screen; three-panel controls tray below.
- All snapshot count and auto-mode JS behavior still works via unchanged IDs.

---

- [ ] **Unit 6: Proposal Detail Screen**

**Goal:** Rebuild `public/proposal-detail.html` (S9) as a two-column proposal workspace.

**Requirements:** R10, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `public/proposal-detail.html`

**Approach:**
- Add `.top-bar` with back button (`href="/dashboard"`) and route pill.
- Add `.proposal-hero` (flex-row, space-between, 170px region): left `.hero-copy` (proposal title + status) and right `.status-widget` (warning-soft background, border-radius 14px, padding 18px, width 260px — shows approval status from JS `id="proposal-root"` sub-elements).
- Replace `<div id="proposal-root">` as the outer shell that JS still targets; internally the JS renders into it. Keep `id="proposal-root"` at the top-level div.
- Add `.proposal-workspace` (flex-row, gap 22px): `.proposal-left` (flex: 1) and `.proposal-right` (width 500px) as sibling columns inside `id="proposal-root"` — OR, restructure so JS renders into the existing `id="proposal-root"` single div and the two-column layout is achieved by the JS itself (see deferred note).
- Since `proposal-detail.js` fully controls what renders inside `id="proposal-root"`, the safest approach is to add the `.top-bar` above it and apply `.proposal-split` (the existing two-column class) as the CSS grid wrapper around the JS-rendered content — letting JS continue using the same render logic. Verify JS renders side-by-side panels inside the root div.

**Test scenarios:**
- Test expectation: none — markup change only; JS handles content.

**Verification:**
- Proposal page shows top bar with back link.
- Content rendered by `proposal-detail.js` still appears within the page body.

---

- [ ] **Unit 7: AWS Deployment via WSL**

**Goal:** Deploy the redesigned app to the existing AWS EC2 web instance using WSL + AWS CLI tools already configured.

**Requirements:** R12

**Dependencies:** Units 1–6 must be complete and committed.

**Files:**
- Read: `infra/.instances.json` (verify IPs are current)
- Read: `scripts/deploy-all.sh` (confirm it rsync's `public/` and restarts pm2)
- No file modifications needed — existing scripts are sufficient.

**Approach:**
- In WSL, run `cd /mnt/d/STUFF/Projects/Hack_Princeton_2026` to access the repo.
- Run `infra/aws/setup.sh` only if EC2 instances are not already running (check `infra/.instances.json`).
- Run `scripts/deploy-all.sh` — this rsync's changed files to `caretaker-web` EC2 and runs `pm2 reload`.
- Verify by curling `http://<WEB_PUBLIC_IP>:3000/` and checking the welcome page HTML is updated.
- If HTTPS is in use, run `scripts/setup-https.sh` (already exists) to refresh certs if needed.

**Execution note:** Run deployment steps interactively in WSL terminal rather than via automated script to monitor SSH output and catch any connectivity issues.

**Test scenarios:**
- Happy path: `scripts/deploy-all.sh` exits 0, `curl http://<ip>:3000` returns 200 with updated HTML.
- Error path: SSH key not found → verify `~/.ssh/caretaker-key.pem` exists in WSL home and `infra/.instances.json` has correct IPs.
- Error path: EC2 instance stopped → run `aws ec2 start-instances --instance-ids <id>` in WSL then retry deploy.

**Verification:**
- Visiting the live URL renders the new white-background welcome screen.
- Dashboard page loads and JS-driven data panels render correctly.
- Camera screens accessible at `/camera/pantry` and `/camera/medicine`.

---

## System-Wide Impact

- **Interaction graph:** No route, middleware, or API changes. All `public/*.js` files are unmodified; they rely on `id`-based DOM queries that are preserved.
- **Error propagation:** Not applicable — no runtime logic changes.
- **State lifecycle risks:** None. DOM restructuring does not affect the Supabase or in-memory store accessed by JS.
- **API surface parity:** No API changes.
- **Integration coverage:** The Knot, Gemini, and Photon integrations render into existing `id` containers; those containers survive the markup refactor.
- **Unchanged invariants:** All `public/*.js` files, `src/*.mjs` server files, API routes, and `infra/` scripts are untouched.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| JS breaks because a container element was moved or re-wrapped | Audit every `id` in each HTML file before committing; keep IDs at the same DOM level relative to their JS querySelector expectations. |
| Three-column dashboard overflows on 1280px screens | Test at 1280px; reduce left/right column widths slightly or add a `max-width` clamp. |
| Camera preview height constraint causes layout shift | Use `min-height` on `.camera-preview-block` rather than fixed height; allow flex growth. |
| AWS EC2 instances stopped since last deploy | Check `infra/.instances.json` IPs against live state; start instances via AWS CLI before deploying. |
| SSH key not in WSL path | Ensure `~/.ssh/caretaker-key.pem` is accessible in WSL, or set `SSH_KEY` env var before running deploy script. |

## Documentation / Operational Notes

- After deployment, visit the live URL and screenshot each route to confirm visual parity with the Pencil design.
- The `proposal-detail.html` change is the riskiest because `proposal-detail.js` fully controls its inner DOM; verify the split layout renders correctly with real proposal data.
- `public/camera.html` (the legacy route wrapper) needs minimal top-bar markup added but is low-priority if it only redirects.

## Sources & References

- Design source: `docs/design/main.pen` (S1–S10 frames)
- Origin plan: `docs/plans/2026-04-19-011-feat-pencil-screen-redesign-plan.md`
- AWS infra: `infra/.instances.json`, `infra/aws/setup.sh`, `scripts/deploy-all.sh`
- Related plan: `docs/plans/2026-04-18-006-feat-aws-deployment-v2-plan.md`
- HTML screens: `public/index.html`, `public/register.html`, `public/dashboard.html`, `public/patient.html`, `public/camera-select.html`, `public/bind.html`, `public/camera-room.html`, `public/proposal-detail.html`
- CSS: `public/styles.css`
