## Aegis — Feature Summary

> Three live video feeds (phone cameras / webcams) → three dedicated iMessage chats (via Photon `imessage-kit`).
> Each feed monitors a specific domain. Each chat delivers alerts and enables family interaction for that domain.

---

### F1: Groceries Chat (iMessage dedicated)

**Powered by:** Vision model + Knot TransactionLink + Knot Shopping API + Photon

**Trigger:** Camera pointed at grocery shelf detects supply is significantly lower than normal (periodic snapshots, ~10 min interval).

**Flow:**
1. Vision model detects "shelves look significantly emptier than baseline"
2. TransactionLink pulls full past order history (SKU-level: exact items, brands, quantities, prices)
3. Agent compares what camera sees on shelves vs. what was in past orders → produces delta of needed items
4. Shopping Agent checks Knot for which delta items are actually orderable (Walmart, Target, Costco, DoorDash, Amazon)
5. Splits into: **[orderable via Knot]** and **[not orderable — flagged for manual buy]**
6. Sends the filtered orderable list to the family's dedicated Groceries iMessage chat
7. Family replies in **natural language** (e.g. "Remove milk, add orange juice") → agent parses + updates cart
8. Family sends approval → Knot `Sync Cart` → `Checkout` → order placed
9. Order confirmation sent back to the same Groceries chat

**Key constraint:** Family never sees items we can't actually order. Vision triggers, TransactionLink provides specificity, Shopping API verifies availability, then family sees only actionable items.

---

### F2: Medical Chat (iMessage dedicated)

**Powered by:** Vision model + TTS (phone speaker) + OpenClaw Heartbeat + Conversational Memory + Photon

**Trigger:** Prescription schedule says it's time for medication + vision model on medicine table camera detects meds not taken.

**Flow:**
1. At scheduled prescription times, the medicine-table phone plays a voice reminder through its speaker: "Time to take your Metformin"
2. Vision model watches the medicine table for changes (pill removal, bottle movement)
3. If vision does not detect medicine taken within configurable window → immediate iMessage to dedicated Medical chat
4. OpenClaw memory tracks: medication schedule, past symptom mentions, drug interactions
5. Daily check-in data stored and referenced next day
   - "Yesterday you mentioned your knee was hurting — how is it today?"
   - "You said you were worried about your Tuesday appointment. Did that go okay?"

**Conversational memory note:** This is infrastructure, not a standalone feature. Every agent interaction builds on MEMORY.md (long-term) + daily JSONL logs (short-term) + semantic search.

---

### F3: Physical Emergency Chat (iMessage dedicated)

**Powered by:** Vision model (high-frequency snapshots) + Photon

**Trigger:** Living area camera detects physical emergency signals. Highest snapshot frequency (~30 seconds).

**Flow:**
1. Vision model analyzes living area snapshots for: person fallen, fire/smoke, prolonged inactivity
2. On detection → **immediate** iMessage to dedicated Physical Emergency chat
3. Message includes: what was detected, timestamp, severity
4. No batching, no delay — fires the moment the event is confirmed

**Emergency examples:**
- "ALERT: Possible fall detected — Mom hasn't moved in 4 minutes. [8:42am]"
- "EMERGENCY: Fire/smoke signal detected in kitchen area. [2:17pm]"

---

### Shared: Daily Summary (once a day, all three domains)

**Powered by:** Photon `MessageScheduler` + LLM call over day's event log

Sent once per evening to a general family chat. Covers all three domains in one message.

Example:
> "Mom today: took morning pills at 8:12am, walked 1,200 steps, no falls or anomalies,
> grocery order arrived at 2pm, flagged one $39 subscription I cancelled for you.
> She asked about her grandson's birthday — reminder: it's Saturday."

---

### Side Features (post-MVP)

- **Bill Protector** (Knot SubManager) — detects and cancels predatory subscriptions targeting seniors
- **Health Agent** (K2 Think V2) — medication schedule, symptom logging, drug-interaction flagging
