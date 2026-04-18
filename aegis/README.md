# Aegis

An always-on elder-care supervisor. Three phones act as cameras (grocery shelf, medicine table, living area) streaming frames to a Next.js server that runs a 3 s perception loop over Gemini Robotics-ER 1.6. The server fires iMessage alerts through a Photon bridge and auto-reorders low groceries via Knot.

## Architecture

- **Linux EC2** — Next.js app, 30 s scheduler (`lib/scheduler.ts`), 3 s perception loop (`lib/perception-loop.ts`), Gemini + Knot calls, JSON state on disk (`data/`).
- **macOS EC2** — Runs the same Next.js build but only `/api/imessage-bridge` is exposed. Loads `@photon-ai/imessage-kit` in-process and forwards `{chatId, text}` into iMessage.
- **3 phones** — Each opens `/onboarding/patient`, picks a camera role (grocery/medical/emergency), and is pinned to `/camera/[role]`. Frames POST to `/api/snapshot`.

## Run the demo

### 1. Env vars

Copy `.env.example` to `.env` and fill in:

| Key | Purpose |
|-----|---------|
| `GEMINI_API_KEY` | Gemini Robotics-ER 1.6 vision calls |
| `GEMINI_FALLBACK_MODEL` | defaults to `gemini-2.5-pro` — same-family fallback when ER 1.6 errors |
| `OPENAI_API_KEY` | Daily-summary text generation (not per-frame) |
| `KNOT_CLIENT_ID`, `KNOT_SECRET`, `KNOT_BASE_URL` | Knot credentials |
| `KNOT_EXTERNAL_USER_ID` | Stable per-elder ID for Knot |
| `KNOT_MERCHANT_ID` | Populated by `npm run prelink:knot` |
| `IMESSAGE_BRIDGE_URL` | On Linux host: full URL of the macOS bridge. Leave unset on macOS host. |
| `IMESSAGE_BRIDGE_TOKEN` | Shared bearer token between Linux ↔ macOS |
| `IMESSAGE_CHAT_GROCERY` / `_MEDICAL` / `_EMERGENCY` / `_GENERAL` | Target chat IDs. Only needed on macOS host. |
| `AEGIS_PUBLIC_URL` | External HTTPS URL phones hit (e.g. `https://aegis.example.com`) |

### 2. Prelink Knot (one-time)

```bash
cd aegis
npm install
npm run prelink:knot
# pick the target merchant; script writes data/knot-{merchants,products}.json
# and prints KNOT_MERCHANT_ID=<id> — paste into .env
```

### 3. Deployment

- Linux app host runbook: [`deploy/linux-ec2.md`](deploy/linux-ec2.md)
- macOS iMessage bridge runbook: [`deploy/macos-ec2.md`](deploy/macos-ec2.md)
- Local dev fallback (no EC2): `scripts/dev-tunnel.sh` / `scripts/dev-tunnel.cmd` — runs `npm run dev` + ngrok

### 4. Three-device onboarding

1. On each phone, open `https://<AEGIS_PUBLIC_URL>/onboarding/patient`.
2. Enter a name, pick a camera role (Medicine table / Living area / Grocery shelf).
3. The page forwards to `/camera/[role]` and starts capturing frames at the role's cadence (emergency 3 s, medical 10 s, grocery 60 s).
4. Caretaker opens `/dashboard` — live frames + perception heartbeat appear within seconds.

## Key endpoints

- `GET /api/perception-state[?sse=1]` — current state snapshot or live SSE feed
- `POST /api/snapshot` — accepts `{domain, image, timestamp}` from camera phones
- `POST /api/grocery/check` — run the grocery analyzer + reorder pipeline on a single frame
- `POST /api/medical/check` — `{image, medication}` — was the expected pill still visible at window-close?
- `POST /api/imessage-bridge` — macOS-only endpoint that forwards to Photon

## Dev

```bash
npm run dev   # local-only
npm run lint
npm run build && npm run start
```
