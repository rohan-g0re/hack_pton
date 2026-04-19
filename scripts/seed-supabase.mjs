/**
 * Idempotent seed for the demo household (same UUIDs as supabase/seed.sql) + demo payment card for Knot.
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
 */
import { createClient } from "@supabase/supabase-js";

const CARETAKER = "11111111-1111-4111-8111-111111111101";
const PATIENT = "22222222-2222-4222-8222-222222222202";

async function main() {
  const urlEnv = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!urlEnv || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const client = createClient(urlEnv, key, { auth: { persistSession: false } });

  await client.from("caretakers").upsert(
    { id: CARETAKER, name: "Rohan Shah", phone: "+1 609-555-0144" },
    { onConflict: "id" }
  );

  await client.from("patients").upsert(
    { id: PATIENT, caretaker_id: CARETAKER, name: "Mira Shah", relationship: "Grandmother" },
    { onConflict: "id" }
  );

  await client.from("cameras").upsert(
    [
      {
        id: "33333333-3333-4333-8333-333333333301",
        patient_id: PATIENT,
        role: "pantry",
        device_name: "Unregistered device",
        bind_token: "bind-pantry-demo",
        status: "offline"
      },
      {
        id: "33333333-3333-4333-8333-333333333302",
        patient_id: PATIENT,
        role: "medicine",
        device_name: "Unregistered device",
        bind_token: "bind-medicine-demo",
        status: "offline"
      }
    ],
    { onConflict: "id" }
  );

  await client.from("inventory_items").upsert(
    [
      {
        id: "44444444-4444-4444-8444-444444444401",
        patient_id: PATIENT,
        name: "Milk",
        target_quantity: 2,
        low_stock_threshold: 1,
        preferred_merchant: "Walmart"
      },
      {
        id: "44444444-4444-4444-8444-444444444402",
        patient_id: PATIENT,
        name: "Bananas",
        target_quantity: 6,
        low_stock_threshold: 2,
        preferred_merchant: "Walmart"
      },
      {
        id: "44444444-4444-4444-8444-444444444403",
        patient_id: PATIENT,
        name: "Oatmeal",
        target_quantity: 2,
        low_stock_threshold: 1,
        preferred_merchant: "Walmart"
      },
      {
        id: "44444444-4444-4444-8444-444444444404",
        patient_id: PATIENT,
        name: "Apples",
        target_quantity: 5,
        low_stock_threshold: 2,
        preferred_merchant: "Walmart"
      }
    ],
    { onConflict: "id" }
  );

  const rxHour = new Date();
  const hh = String(rxHour.getHours()).padStart(2, "0");
  const mm = String(rxHour.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}:00`;

  await client.from("prescriptions").upsert(
    [
      {
        id: "55555555-5555-4555-8555-555555555501",
        patient_id: PATIENT,
        medicine_name: "Allergy Relief",
        expected_count: 1,
        scheduled_time: timeStr,
        window_minutes: 30,
        purpose: "Seasonal allergy control"
      },
      {
        id: "55555555-5555-4555-8555-555555555502",
        patient_id: PATIENT,
        medicine_name: "Vitamin D",
        expected_count: 1,
        scheduled_time: timeStr,
        window_minutes: 30,
        purpose: "Daily vitamin support"
      }
    ],
    { onConflict: "id" }
  );

  await client.from("payment_cards").delete().eq("patient_id", PATIENT);
  const { error: payErr } = await client.from("payment_cards").insert({
    patient_id: PATIENT,
    knot_card_token: process.env.DEMO_KNOT_CARD_TOKEN || "demo_knot_vault_token",
    card_last_four: "4242",
    card_brand: "VISA"
  });
  if (payErr) {
    console.warn("payment_cards:", payErr.message);
  }

  await client.from("events").upsert(
    {
      id: "66666666-6666-4666-8666-666666666601",
      patient_id: PATIENT,
      type: "system",
      severity: "info",
      title: "Demo household ready",
      message: "Dashboard initialized for one caretaker, one patient, and two camera roles."
    },
    { onConflict: "id" }
  );

  console.log("Seed upserts completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
