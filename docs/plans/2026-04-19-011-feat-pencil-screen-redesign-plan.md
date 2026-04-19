---
title: Pencil Screen Redesign From Static Frontend Flow
type: feat
status: active
date: 2026-04-19
origin: user request
---

# Pencil Screen Redesign From Static Frontend Flow

## Overview

Rebuild the current Okay Today / Caretaker Command Center screen set in `docs/design/main.pen` using the implemented static HTML/CSS/JS flow as the source of truth. The output is a complete, modern, well-spaced desktop screen set with a white-majority healthcare theme that can guide later updates to the simple `public/*.html`, `public/*.css`, and `public/*.js` files.

## Problem Frame

The existing frontend works as a hackathon demo but uses heavy warm backgrounds, large rounded cards, and dense panel grouping. The design file is currently empty, so there is no modern screen reference for the implemented routes. The user explicitly asked not to inspect the live website and instead to understand the existing code flow, then rebuild the screens in Pencil.

## Requirements Trace

- R1. Do not use the live website as source material; derive the flow from the code.
- R2. Build screens in `docs/design/main.pen`.
- R3. Cover the implemented static frontend screens and navigation states.
- R4. Keep the design compatible with simple HTML/CSS/JS implementation.
- R5. Make the visual system significantly more modern, spacious, and white-majority.
- R6. Preserve product semantics: caretaker setup, QR pairing, camera monitoring, dashboard events, inventory, medication, payment, and proposal approval.

## Scope Boundaries

- No production HTML/CSS/JS implementation changes in this pass.
- No dependency additions.
- No live website crawling or screenshot matching.
- No mobile variants unless the Pencil build reveals extra time; desktop frames are the primary deliverable.

## Context & Research

### Relevant Code and Patterns

- `src/app.mjs` defines the static route map: `/`, `/register`, `/dashboard`, `/dashboard/patient`, `/bind`, `/camera`, `/camera/pantry`, `/camera/medicine`, and `/dashboard/proposals/:id`.
- `public/index.html` is the role selector.
- `public/register.html` and `public/register.js` capture caretaker, phone, patient, and relationship, then redirect to `/dashboard`.
- `public/dashboard.html` and `public/dashboard.js` render the main command center: profile/payment, camera pairing, camera status, inventory, medication schedule, purchase proposals, and event feed.
- `public/patient.html` and `public/patient.js` edit inventory rows, prescription rows, and payment card status.
- `public/camera-select.html` selects pantry vs. medicine.
- `public/bind.html` and `public/bind.js` show a six-digit pair code and optional QR, then redirect to the role-specific camera room when paired.
- `public/camera-room.html` and `public/camera-room.js` power both pantry and medicine camera screens with device setup, live preview, snapshot controls, and last server response.
- `public/proposal-detail.html` and `public/proposal-detail.js` show proposal items, Gemini confidence, approve/reject actions, and completed Knot checkout state.
- `public/styles.css` provides the current token direction, but the redesign should move away from beige-heavy surfaces toward cleaner white healthcare UI.

### Institutional Learnings

- No existing `docs/solutions/` guidance applies directly to visual design generation.

### External References

- None. The user explicitly asked not to inspect the website, and local code contains enough source material.

## Key Technical Decisions

- Use `docs/design/main.pen` as the only modified implementation artifact for the work step.
- Build 9 top-level desktop frames arranged in a 3-by-3 canvas grid.
- Use a mostly white palette with ink text, soft green medical accents, restrained amber/red states, and light blue-gray surfaces for hierarchy.
- Represent camera preview and QR areas with design-native frames rather than external assets so the result remains portable in the `.pen` file.
- Favor realistic static UI states over wireframes: show populated dashboard data, active pair code, active camera capture, and an awaiting proposal state.

## Open Questions

### Resolved During Planning

- Should the design use the live website? No, per the user; use local code only.
- Should implementation files change now? No, the request specifically names `docs/design/main.pen`.

### Deferred to Implementation

- Exact node IDs for generated Pencil frames are determined by the Pencil server during insertion.
- Whether a later code pass adopts the new design is deferred to a separate implementation request.

## Implementation Units

- [ ] **Unit 1: Establish Design Tokens and Screen Frames**

**Goal:** Create a modern white-majority visual foundation and top-level frames for each implemented screen.

**Requirements:** R2, R3, R5

**Dependencies:** None

**Files:**
- Modify: `docs/design/main.pen`

**Approach:**
- Add color, typography, and spacing variables in the `.pen` file.
- Create 9 desktop screen frames: Welcome, Register, Dashboard, Patient Settings, Camera Select, Bind Camera, Pantry Cam, Medicine Cam, Proposal Detail.
- Use consistent screen dimensions and spacing so later comparison is easy.

**Patterns to follow:**
- Route inventory from `src/app.mjs`.
- Screen content from `public/*.html` and dynamic states from `public/*.js`.

**Test scenarios:**
- Test expectation: none -- design artifact only, no runtime behavior.

**Verification:**
- The Pencil document shows all 9 named frames with no overlap and no lingering placeholder flags.

- [ ] **Unit 2: Redesign Onboarding and Pairing Screens**

**Goal:** Build the role selector, caretaker registration, camera role selector, and bind-code screens.

**Requirements:** R3, R4, R5, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `docs/design/main.pen`

**Approach:**
- Keep the forms and navigation from the code, but redesign with stronger hierarchy, cleaner form grouping, less visual chrome, and better whitespace.
- Use familiar icons for caretaker, camera, pantry, medicine, and pairing states.

**Patterns to follow:**
- `public/index.html`
- `public/register.html`
- `public/camera-select.html`
- `public/bind.html`

**Test scenarios:**
- Test expectation: none -- design artifact only, no runtime behavior.

**Verification:**
- A reviewer can trace the first-time caretaker and nanny-cam setup flow by reading the frames alone.

- [ ] **Unit 3: Redesign Dashboard, Settings, and Proposal Screens**

**Goal:** Build the core caretaker workflow screens with modern dashboard information architecture.

**Requirements:** R3, R4, R5, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `docs/design/main.pen`

**Approach:**
- Dashboard should prioritize patient status, camera health, urgent events, proposals, and editable care data.
- Patient settings should use editable table-like rows with clear action bars.
- Proposal detail should make approve/reject decisions clear and show Gemini/Knot trust signals without clutter.

**Patterns to follow:**
- `public/dashboard.html`
- `public/dashboard.js`
- `public/patient.html`
- `public/patient.js`
- `public/proposal-detail.html`
- `public/proposal-detail.js`

**Test scenarios:**
- Test expectation: none -- design artifact only, no runtime behavior.

**Verification:**
- The dashboard screen contains every major panel currently rendered by code, but with cleaner spacing and priority.

- [ ] **Unit 4: Redesign Pantry and Medicine Camera Screens**

**Goal:** Build the two role-specific camera operation screens.

**Requirements:** R3, R4, R5, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `docs/design/main.pen`

**Approach:**
- Use the same layout system for both roles while varying copy, status details, and scene response content.
- Show device setup, live preview, auto-capture state, send-now control, snapshot count, last sent time, and last server response.

**Patterns to follow:**
- `public/camera-room.html`
- `public/camera-room.js`

**Test scenarios:**
- Test expectation: none -- design artifact only, no runtime behavior.

**Verification:**
- Pantry and medicine screens are visibly related but distinct enough for role clarity.

## System-Wide Impact

- **Interaction graph:** No runtime interaction changes; the design mirrors existing frontend navigation.
- **Error propagation:** Not applicable to this design-only change.
- **State lifecycle risks:** Not applicable to runtime; design should still show active, pending, warning, and success states.
- **API surface parity:** No API changes.
- **Integration coverage:** Not applicable.
- **Unchanged invariants:** Static frontend routes and behavior remain unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Design drifts from actual implemented flow | Use local route map and screen files as the source of truth. |
| Visuals become too complex for simple HTML/CSS/JS | Avoid dependency-heavy interaction patterns and keep components implementable with semantic HTML, CSS grid/flex, and small JS updates. |
| White-majority theme loses state clarity | Use restrained status colors, clear icons, and table hierarchy. |

## Documentation / Operational Notes

- This plan intentionally modifies the Pencil design artifact only. A future implementation pass can update `public/styles.css` and screen markup to match.

## Sources & References

- Related code: `src/app.mjs`
- Related code: `public/index.html`
- Related code: `public/register.html`
- Related code: `public/dashboard.html`
- Related code: `public/dashboard.js`
- Related code: `public/patient.html`
- Related code: `public/patient.js`
- Related code: `public/camera-select.html`
- Related code: `public/bind.html`
- Related code: `public/bind.js`
- Related code: `public/camera-room.html`
- Related code: `public/camera-room.js`
- Related code: `public/proposal-detail.html`
- Related code: `public/proposal-detail.js`
