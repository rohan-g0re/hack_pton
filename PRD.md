# Aegis

**An AI Guardian for Aging Parents**

*HackPrinceton 2026 · Healthcare Track · Project Plan*

---

## The Problem

56 million Americans are 65+, and most want to age at home. Their adult children are terrified about it — and they should be.

Current solutions are fragmented and dumb: Life Alert pendants, paper pill boxes, robocall scams, family group chats where nobody replies. Elderly people are also the #1 target of predatory subscription scams and medication cost gouging.

Nothing exists that watches the whole picture — the health, the bills, the groceries, the clinical-trial opportunities — and actually takes action.

## The Solution

Aegis is a 24/7 home guardian: one physical device on grandma's kitchen counter, plus a swarm of AI agents that take real actions on behalf of the family. The adult child gets iMessage alerts and a web dashboard — no new app to install, no wearables to fight over.

The core bet: the right form factor for this user is a stationary hub, not a wearable. Echo, Nest Hub, HomePod all ship as kitchen-counter appliances for a reason — elderly users hate wearing things, but tolerate appliances.

## Hardware: the "Guardian Hub"

One physical unit built from the MLH kit. Not wireless, not wearable, not a wristband. A small plugged-in appliance that sits on a counter — which is exactly how competing products in this space ship.

### Components and responsibilities

| Role                      | Component                                            | What it does in the demo                                            | Build effort                            |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| Fall detection            | Raspberry Pi + Logitech webcam                       | Watches the room; pose goes horizontal + low for >2s triggers alert | ~3 hrs (pretrained MediaPipe/YOLO pose) |
| Pill monitoring           | Arduino + load cell OR photoresistor under pill slot | Detects if morning meds were taken by 11am; escalates if not        | ~2 hrs                                  |
| Panic button              | Arduino + big arcade-style button                    | Judge presses it → full alert cascade live on stage                | ~1 hr                                   |
| Voice check-in (optional) | Pi + USB mic                                         | Daily 'how are you feeling' transcribed and flagged by K2 Think     | ~2 hrs                                  |
| Room presence (optional)  | Arduino + PIR motion sensor                          | No motion for 14 hrs triggers check-in                              | ~1 hr                                   |

### Build advice

- Mount everything on a single foam-board or painted cardboard housing so it reads as one product on the judging table.
- Don't pair over Bluetooth on stage — every wireless link is a live demo risk. Use USB/wired where possible.
- Have a pre-recorded fall-detection clip ready as a backup in case the live pose model misfires during the pitch.**-** 

## Agent Architecture

Six specialized agents, each running in its own Dedalus Container (one container per agent satisfies the "agent swarm" criterion explicitly). They communicate via a shared event bus.

| Agent               | Powered by                                                  | Job                                                                                                          |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Health Agent        | K2 Think V2                                                 | Medication schedule, symptom logging, drug-interaction flagging                                              |
| Replenishment Agent | Knot AgenticShopping (Walmart / Costco / Target / DoorDash) | Auto-reorders groceries and household essentials when Pi/Arduino detect low supply                           |
| Adherence Agent     | Knot TransactionLink                                        | Reads pharmacy transaction history; flags missed refills; drafts reminders (does NOT purchase meds directly) |
| Bill Protector      | Knot SubManager                                             | Surfaces and cancels predatory subscriptions targeting seniors                                               |
| Trial-Matcher Agent | K2 Think V2 + ClinicalTrials.gov                            | Reasons over patient profile to match ongoing clinical trials (Regeneron track)                              |
| Family Liaison      | Photon iMessage                                             | Pushes alerts, daily summaries, and action prompts to the adult child                                        |

### Why we split Shopping into two agents

Replenishment uses Knot's AgenticShopping, which supports Walmart, Costco, Target, DoorDash, Amazon, and hundreds more — grocery reorder is a strong, visual demo.

Adherence uses Knot's TransactionLink to read pharmacy refill history. It does NOT attempt to purchase controlled substances through an API — that's a federal no-go. Instead, it detects missed refills and drafts reminders for grandma and the adult child.

This split is also strategically better for the Knot track: we use two distinct Knot products meaningfully, which is exactly what their "Best Use of Product Suite" prize rewards.

## Track Coverage

Single coherent product hitting up to 14 tracks. One main (Healthcare), one optional main (Hardware), and the rest special:

| Track                       | Type            | How Aegis hits it                                                                                                                                                                    |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Healthcare                  | Main (required) | Core problem — aging-in-place safety + medication adherence + clinical-trial matching                                                                                               |
| Best Overall                | Automatic       | Integrates hardware, multi-agent AI, and real social impact                                                                                                                          |
| Best Hardware Hack          | Optional main   | Guardian Hub: Pi + webcam fall detection + Arduino pill-box sensor + panic button                                                                                                    |
| Best Rookie Hack            | Optional main   | If team qualifies                                                                                                                                                                    |
| Eragon — What Runs Monday  | Special         | Agents take real actions (reorder groceries, cancel scam subs, draft refill reminders) — hits Depth of Action hard                                                                  |
| Knot API                    | Special         | Uses TransactionLink (pharmacy pattern detection) + AgenticShopping (grocery reorder via Walmart/Costco/Target) + SubManager (scam-sub cancellation) — three products, real actions |
| K2 Think V2                 | Special         | Non-trivial reasoning: drug-interaction flagging, trial-eligibility matching, symptom triage                                                                                         |
| Photon iMessage             | Special         | Family caregiver interface — no new app required                                                                                                                                    |
| Dedalus Containers          | Special         | Agent swarm: one container per specialized agent (Health, Replenishment, Adherence, Trial-Matcher, Family Liaison)                                                                   |
| Orchids                     | Special         | Family caregiver dashboard                                                                                                                                                           |
| Regeneron (Clinical Trials) | Special         | Trial-Matcher agent: first-class feature, not bolted on                                                                                                                              |
| Bojarski Hardware + AI      | Special         | Same Guardian Hub build, framed differently                                                                                                                                          |
| Telora Startup Track        | Special         | Aging-in-place is a real multi-billion-dollar market                                                                                                                                 |
| Enter Pro                   | Special         | Take the free credits                                                                                                                                                                |

## Hitting the Main Judging Criteria

- **Creativity** — the "ah-ha" is reframing Knot (a fintech infrastructure tool) as elder-protection infrastructure. Nobody else will pitch it this way.
- **Utility** — every agent does one concrete thing a real family would pay for, and the demo shows live actions (not chat summaries).
- **Charity** — elder loneliness, elder financial abuse, and medication nonadherence are all measurable, documented crises. Easy to make the case to judges.
- **Avidity** — the pitch lands hardest with a personal story. Anyone with grandparents instantly understands the problem.

## 36-Hour MVP Scope

We are shipping a demo, not a product. The critical path must work live; everything else can be stubbed with realistic mock data.

### Must work live on stage

- Fall detection on Pi/webcam (judge falls or we trigger it manually).
- One Knot integration end-to-end — SubManager cancelling a fake scam subscription is the most demo-able.
- One K2 Think reasoning call — trial eligibility against a mock patient profile.
- Photon iMessage alert firing when the fall is detected.
- Orchids dashboard showing live event stream during the demo.

### Can be stubbed with convincing mocks

- Additional agents beyond the core set (Bill Protector and Trial-Matcher can use canned responses for the demo).
- Additional Knot products beyond the one that works live.
- Voice check-in and room-presence hardware (bonus if working, skip if time-pressed).


## Track Enrollment Plan

**Required main track (pick exactly one):**

- Healthcare

**Optional main tracks we qualify for:**

- Best Hardware Hack
- Best Rookie Hack (if team qualifies)

**Special tracks to enroll in:**

- Eragon (Build What Actually Runs Monday)
- Knot API
- K2 Think V2 (MBZUAI)
- Agents in iMessage (Photon)
- Best Use of Dedalus Containers
- Best AI-Powered App (Orchids)
- AI & Tech for Clinical Trials (Regeneron)
- Best Hardware + AI (Justin Bojarski)
- Telora Startup Track
- Enter Pro
