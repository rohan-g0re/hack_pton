/**
 * Supabase-backed store.
 * Uses fixed seed UUIDs from supabase/seed.sql.
 */
import { createSeedState } from "./demo-data.mjs";

export const SEED_CARETAKER_ID = "11111111-1111-4111-8111-111111111101";
export const SEED_PATIENT_ID = "22222222-2222-4222-8222-222222222202";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cameraStatusFromTimestamps(lastSeenAt) {
  if (!lastSeenAt) {
    return "offline";
  }
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  if (ageMs > 120000) {
    return "stale";
  }
  return "online";
}

function formatTime(t) {
  if (!t) {
    return "12:00";
  }
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export class SupabaseStore {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} client
   */
  constructor(client) {
    this.client = client;
  }

  async getCameraByRole(role, patientId = SEED_PATIENT_ID) {
    const res = await this.client
      .from("cameras")
      .select("*")
      .eq("patient_id", patientId)
      .eq("role", role)
      .maybeSingle();
    if (res.error) {
      throw res.error;
    }
    return res.data;
  }

  async listState() {
    const { data: caretaker, error: cErr } = await this.client
      .from("caretakers")
      .select("id, name, phone, email, photon_status, photon_thread_opened_at, photon_last_error, photon_last_smoke_test_at")
      .eq("id", SEED_CARETAKER_ID)
      .maybeSingle();
    if (cErr) {
      throw cErr;
    }
    const { data: patient, error: pErr } = await this.client
      .from("patients")
      .select("*")
      .eq("id", SEED_PATIENT_ID)
      .maybeSingle();
    if (pErr) {
      throw pErr;
    }
    if (!caretaker || !patient) {
      throw new Error("Seed caretaker/patient not found. Run supabase/seed.sql or npm run seed:supabase.");
    }

    const { data: camRows } = await this.client
      .from("cameras")
      .select("*")
      .eq("patient_id", SEED_PATIENT_ID)
      .order("role");

    const cameras = (camRows || []).map((row) => ({
      id: row.id,
      role: row.role,
      label: row.role === "pantry" ? "Pantry Nanny Cam" : "Medicine Nanny Cam",
      deviceName: row.device_name,
      lastSeenAt: row.last_seen_at,
      lastSnapshotAt: row.last_snapshot_at,
      lastSceneId: null,
      status: cameraStatusFromTimestamps(row.last_seen_at)
    }));

    const { data: invRows } = await this.client
      .from("inventory_items")
      .select("*")
      .eq("patient_id", SEED_PATIENT_ID);
    const inventory = (invRows || []).map((row) => ({
      id: row.id,
      name: row.name,
      targetQuantity: row.target_quantity,
      lowStockThreshold: row.low_stock_threshold,
      preferredMerchant: row.preferred_merchant
    }));

    const { data: rxRows } = await this.client
      .from("prescriptions")
      .select("*")
      .eq("patient_id", SEED_PATIENT_ID);
    const prescriptions = (rxRows || []).map((row) => ({
      id: row.id,
      medicineName: row.medicine_name,
      expectedCount: row.expected_count,
      scheduledTime: formatTime(row.scheduled_time),
      windowMinutes: row.window_minutes,
      purpose: row.purpose || ""
    }));

    const { data: proposalRows } = await this.client
      .from("purchase_proposals")
      .select("*")
      .eq("patient_id", SEED_PATIENT_ID)
      .order("created_at", { ascending: false });

    const proposals = (proposalRows || []).map((row) => ({
      id: row.id,
      status: row.status,
      confidence: row.confidence ?? 0.8,
      merchant: row.merchant,
      estimatedTotal: Number(row.estimated_total ?? 0),
      items: normalizeProposalItems(row.items),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const { data: checkoutRows } = await this.client
      .from("checkout_sessions")
      .select("*")
      .eq("patient_id", SEED_PATIENT_ID)
      .order("created_at", { ascending: false });

    const checkoutSessions = (checkoutRows || []).map((row) => ({
      id: row.id,
      proposalId: row.proposal_id,
      provider: row.provider,
      status: row.status,
      createdAt: row.created_at,
      merchant: row.merchant
    }));

    const { data: eventRows } = await this.client
      .from("events")
      .select("*")
      .eq("patient_id", SEED_PATIENT_ID)
      .order("created_at", { ascending: false })
      .limit(100);

    const events = (eventRows || []).map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      relatedId: row.related_id
    }));

    const eventIds = (eventRows || []).map((e) => e.id);
    let notifications = [];
    if (eventIds.length) {
      const { data: notifRaw } = await this.client
        .from("notifications")
        .select("*")
        .in("event_id", eventIds)
        .order("sent_at", { ascending: false })
        .limit(50);
      notifications = (notifRaw || []).map((row) => ({
      id: row.id,
      channel: row.channel,
      deliveryStatus: row.delivery_status,
      relatedEventId: row.event_id,
      recipient: row.recipient,
      sentAt: row.sent_at,
      message: row.message
      }));
    }

    const { data: cardRow } = await this.client
      .from("payment_cards")
      .select("*")
      .eq("patient_id", SEED_PATIENT_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const paymentCard = cardRow
      ? {
          brand: cardRow.card_brand,
          last4: cardRow.card_last_four,
          status: "active"
        }
      : { brand: "VISA", last4: "4242", status: "active" };

    return {
      meta: {
        createdAt: new Date().toISOString(),
        demoMode: false,
        supabase: true
      },
      caretaker: {
        id: caretaker.id,
        name: caretaker.name,
        phone: caretaker.phone,
        email: caretaker.email || "",
        photonStatus: caretaker.photon_status || "not_configured",
        photonThreadOpenedAt: caretaker.photon_thread_opened_at || null,
        photonLastError: caretaker.photon_last_error || null,
        photonLastSmokeTestAt: caretaker.photon_last_smoke_test_at || null
      },
      patient: { id: patient.id, name: patient.name, relationship: patient.relationship },
      paymentCard,
      cameras,
      inventory,
      prescriptions,
      proposals,
      checkoutSessions,
      events,
      notifications
    };
  }

  async reset() {
    const { data: evList } = await this.client.from("events").select("id").eq("patient_id", SEED_PATIENT_ID);
    const evIds = (evList || []).map((e) => e.id);
    if (evIds.length) {
      await this.client.from("notifications").delete().in("event_id", evIds);
    }
    await this.client.from("events").delete().eq("patient_id", SEED_PATIENT_ID);
    await this.client.from("checkout_sessions").delete().eq("patient_id", SEED_PATIENT_ID);
    await this.client.from("purchase_proposals").delete().eq("patient_id", SEED_PATIENT_ID);

    const { data: cams } = await this.client.from("cameras").select("id").eq("patient_id", SEED_PATIENT_ID);
    const camIds = (cams || []).map((c) => c.id);
    if (camIds.length) {
      await this.client.from("snapshots").delete().in("camera_id", camIds);
    }

    await this.client.from("inventory_items").delete().eq("patient_id", SEED_PATIENT_ID);
    await this.client.from("prescriptions").delete().eq("patient_id", SEED_PATIENT_ID);

    await this.seedDefaultInventoryAndRx();
    await this.client.from("events").insert({
      patient_id: SEED_PATIENT_ID,
      type: "system",
      severity: "info",
      title: "Data reset",
      message: "State cleared and pantry schedule re-seeded from defaults."
    });
    return this.listState();
  }

  async seedDefaultInventoryAndRx() {
    const seed = createSeedState();
    for (const item of seed.inventory) {
      await this.client.from("inventory_items").insert({
        patient_id: SEED_PATIENT_ID,
        name: item.name,
        target_quantity: item.targetQuantity,
        low_stock_threshold: item.lowStockThreshold,
        preferred_merchant: item.preferredMerchant
      });
    }
    for (const rx of seed.prescriptions) {
      const [h, m] = rx.scheduledTime.split(":").map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      await this.client.from("prescriptions").insert({
        patient_id: SEED_PATIENT_ID,
        medicine_name: rx.medicineName,
        expected_count: rx.expectedCount,
        scheduled_time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
        window_minutes: rx.windowMinutes,
        purpose: rx.purpose || ""
      });
    }
  }

  async updateProfile(payload) {
    if (payload.caretakerName || payload.phone || payload.email !== undefined || payload.photonStatus) {
      // Validate phone when provided
      if (payload.phone) {
        const { normalizePhone } = await import("../services/photon/config.mjs");
        const normalized = normalizePhone(payload.phone);
        if (!normalized) {
          throw new Error("phone must be a valid E.164 number (e.g. +16095550100).");
        }
        payload.phone = normalized;
      }
      await this.client
        .from("caretakers")
        .update({
          ...(payload.caretakerName ? { name: String(payload.caretakerName) } : {}),
          ...(payload.phone ? { phone: payload.phone } : {}),
          ...(payload.email !== undefined ? { email: String(payload.email) } : {}),
          ...(payload.photonStatus ? { photon_status: String(payload.photonStatus) } : {})
        })
        .eq("id", SEED_CARETAKER_ID);
    }
    if (payload.patientName || payload.relationship) {
      await this.client
        .from("patients")
        .update({
          ...(payload.patientName ? { name: String(payload.patientName) } : {}),
          ...(payload.relationship ? { relationship: String(payload.relationship) } : {})
        })
        .eq("id", SEED_PATIENT_ID);
    }
    await this.client.from("events").insert({
      patient_id: SEED_PATIENT_ID,
      type: "profile",
      severity: "info",
      title: "Profile updated",
      message: "Caretaker and patient details were updated from the dashboard."
    });
    return this.listState();
  }

  async replaceInventory(items) {
    await this.client.from("inventory_items").delete().eq("patient_id", SEED_PATIENT_ID);
    for (const item of items) {
      await this.client.from("inventory_items").insert({
        patient_id: SEED_PATIENT_ID,
        name: String(item.name),
        target_quantity: Number(item.targetQuantity) || 0,
        low_stock_threshold: Number(item.lowStockThreshold) || 0,
        preferred_merchant: String(item.preferredMerchant || "Walmart")
      });
    }
    await this.client.from("events").insert({
      patient_id: SEED_PATIENT_ID,
      type: "inventory",
      severity: "info",
      title: "Inventory updated",
      message: "The pantry baseline was updated by the caretaker."
    });
    return this.listState();
  }

  async replacePrescriptions(items) {
    await this.client.from("prescriptions").delete().eq("patient_id", SEED_PATIENT_ID);
    for (const item of items) {
      const [h, m] = String(item.scheduledTime || "12:00").split(":").map(Number);
      await this.client.from("prescriptions").insert({
        patient_id: SEED_PATIENT_ID,
        medicine_name: String(item.medicineName),
        expected_count: Number(item.expectedCount) || 1,
        scheduled_time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
        window_minutes: Number(item.windowMinutes) || 30,
        purpose: String(item.purpose || "")
      });
    }
    await this.client.from("events").insert({
      patient_id: SEED_PATIENT_ID,
      type: "prescription",
      severity: "info",
      title: "Prescription updated",
      message: "The medication schedule was updated by the caretaker."
    });
    return this.listState();
  }

  async registerCamera(role, payload) {
    const row = await this.getCameraByRole(role);
    if (!row) {
      throw new Error(`Unknown camera role: ${role}`);
    }
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("cameras")
      .update({
        device_name: payload.deviceName || `${role} browser device`,
        last_seen_at: now,
        status: "online"
      })
      .eq("id", row.id);
    if (error) {
      throw error;
    }
    return {
      id: row.id,
      role,
      label: role === "pantry" ? "Pantry Nanny Cam" : "Medicine Nanny Cam",
      deviceName: payload.deviceName || `${role} browser device`,
      status: "online",
      lastSeenAt: now
    };
  }

  async generatePairingCode(role) {
    const row = await this.getCameraByRole(role);
    if (!row) {
      throw new Error(`Unknown camera role: ${role}`);
    }
    const makeCode = () => String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    let code;
    let attempts = 0;
    do {
      code = makeCode();
      attempts++;
      if (attempts > 20) throw new Error("Could not generate unique pairing code.");
      const { data } = await this.client.from("cameras").select("id").eq("pairing_code", code).maybeSingle();
      if (!data) break;
    } while (true);

    const { error } = await this.client
      .from("cameras")
      .update({ pairing_code: code, pairing_expires_at: expiresAt })
      .eq("id", row.id);
    if (error) throw error;
    return { code, role, expiresAt };
  }

  async pairCamera(code) {
    const normalized = String(code || "").replace(/\D/g, "");
    const { data: row, error } = await this.client
      .from("cameras")
      .select("*")
      .eq("pairing_code", normalized)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Pairing code not recognized.");
    if (new Date(row.pairing_expires_at) < new Date()) {
      await this.client.from("cameras").update({ pairing_code: null, pairing_expires_at: null }).eq("id", row.id);
      throw new Error("Pairing code expired.");
    }
    const deviceName = `${row.role === "pantry" ? "Kitchen" : "Medicine"} device`;
    const now = new Date().toISOString();
    const bindToken = `bind-${row.role}-${Math.random().toString(36).slice(2, 9)}`;
    await this.client
      .from("cameras")
      .update({
        device_name: deviceName,
        last_seen_at: now,
        status: "online",
        bind_token: bindToken,
        pairing_code: null,
        pairing_expires_at: null
      })
      .eq("id", row.id);
    await this.client.from("events").insert({
      patient_id: SEED_PATIENT_ID,
      type: "camera",
      severity: "info",
      title: `${row.role === "pantry" ? "Pantry" : "Medicine"} camera paired`,
      message: `Camera bound via 6-digit code. Device: ${deviceName}.`
    });
    return this.registerCamera(row.role, { deviceName });
  }

  async updatePaymentCard(payload) {
    await this.client.from("payment_cards").delete().eq("patient_id", SEED_PATIENT_ID);
    await this.client.from("payment_cards").insert({
      patient_id: SEED_PATIENT_ID,
      knot_card_token: payload.knotCardToken || process.env.DEMO_KNOT_CARD_TOKEN || (() => { throw new Error("knotCardToken required"); })(),
      card_last_four: String(payload.last4 || "4242").replace(/\D/g, "").slice(-4).padStart(4, "0"),
      card_brand: String(payload.brand || "VISA")
    });
    await this.client.from("events").insert({
      patient_id: SEED_PATIENT_ID,
      type: "checkout",
      severity: "info",
      title: "Payment card updated",
      message: "Payment card on file was updated."
    });
    return this.listState();
  }

  async recordSnapshot(role, payload) {
    const row = await this.getCameraByRole(role);
    if (!row) {
      throw new Error(`Unknown camera role: ${role}`);
    }
    const now = payload.capturedAt || new Date().toISOString();
    const imageUrl = payload.imageUrl || null;
    if (!imageUrl) {
      throw new Error("imageUrl is required for snapshots.");
    }

    const insert = {
      camera_id: row.id,
      captured_at: now,
      processed: false,
      image_url: imageUrl
    };

    const { data: snap, error } = await this.client.from("snapshots").insert(insert).select().single();
    if (error) {
      throw error;
    }

    await this.client
      .from("cameras")
      .update({
        last_seen_at: now,
        last_snapshot_at: now,
        status: "online"
      })
      .eq("id", row.id);

    return {
      queued: true,
      snapshotId: snap.id,
      role,
      message: "Snapshot stored. Background worker will analyze and update proposals shortly."
    };
  }

  async approveProposal(id) {
    const { data: row, error } = await this.client.from("purchase_proposals").select("*").eq("id", id).maybeSingle();
    if (error) {
      throw error;
    }
    if (!row) {
      throw new Error("Proposal not found.");
    }
    if (!["awaiting_approval", "review"].includes(row.status)) {
      throw new Error("Proposal cannot be approved in its current state.");
    }
    await this.client
      .from("purchase_proposals")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id);

    await this.client.from("events").insert({
      patient_id: row.patient_id,
      type: "checkout",
      severity: "info",
      title: "Proposal approved",
      message: `Caretaker approved replenishment. Knot checkout will run in the worker.`,
      related_id: id
    });

    const proposal = {
      id: row.id,
      status: "approved",
      items: normalizeProposalItems(row.items),
      confidence: row.confidence,
      merchant: row.merchant,
      estimatedTotal: Number(row.estimated_total ?? 0),
      updatedAt: new Date().toISOString()
    };
    return { proposal, checkout: null };
  }

  async rejectProposal(id) {
    const { data: row, error } = await this.client.from("purchase_proposals").select("*").eq("id", id).maybeSingle();
    if (error) {
      throw error;
    }
    if (!row) {
      throw new Error("Proposal not found.");
    }
    if (!["awaiting_approval", "review"].includes(row.status)) {
      throw new Error("Proposal cannot be rejected in its current state.");
    }
    await this.client
      .from("purchase_proposals")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);
    await this.client.from("events").insert({
      patient_id: row.patient_id,
      type: "checkout",
      severity: "info",
      title: "Proposal rejected",
      message: "The caretaker rejected the pantry replenishment proposal."
    });
    return {
      id: row.id,
      status: "rejected",
      items: normalizeProposalItems(row.items),
      updatedAt: new Date().toISOString()
    };
  }
}

function normalizeProposalItems(items) {
  if (!items || !Array.isArray(items)) {
    return [];
  }
  return items.map((i) => ({
    name: i.name,
    reorderQuantity: i.reorderQuantity ?? i.reorder_quantity ?? 0
  }));
}
