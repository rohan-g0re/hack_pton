import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { createClient } from "@supabase/supabase-js";

const dirname = path.dirname(url.fileURLToPath(import.meta.url));
const migrationPath = path.join(dirname, "../supabase/migrations/001_initial_schema.sql");

test("migration file defines all core tables and camera uniqueness", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const table of [
    "caretakers",
    "patients",
    "cameras",
    "inventory_items",
    "prescriptions",
    "payment_cards",
    "snapshots",
    "pantry_analyses",
    "purchase_proposals",
    "checkout_sessions",
    "medication_checks",
    "events",
    "notifications"
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public.${table}`, "i"));
  }
  assert.match(sql, /unique \(patient_id, role\)/i);
});

test("seed file inserts demo caretaker and patient", () => {
  const seed = fs.readFileSync(path.join(dirname, "../supabase/seed.sql"), "utf8");
  assert.match(seed, /Rohan Shah/);
  assert.match(seed, /Mira Shah/);
});

test(
  "integration: Supabase client can round-trip an event row (requires SUPABASE_URL + service key)",
  { skip: !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY },
  async () => {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const patientId = "22222222-2222-4222-8222-222222222202";

    const inserted = await client
      .from("events")
      .insert({
        patient_id: patientId,
        type: "system",
        severity: "info",
        title: "schema test ping",
        message: "DB round-trip probe"
      })
      .select()
      .single();

    assert.ifError(inserted.error);
    assert.equal(inserted.data.message, "DB round-trip probe");
  }
);
