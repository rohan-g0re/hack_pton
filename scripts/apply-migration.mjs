#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sql = fs.readFileSync(new URL("../supabase/migrations/002_pairing_codes.sql", import.meta.url), "utf8");

// Split on semicolons and run each statement
const stmts = sql.split(";").map(s => s.trim()).filter(Boolean);
for (const stmt of stmts) {
  const { error } = await sb.from("_migrations_stub").select().limit(0).then(() => ({ error: null }));
  // Use raw postgres via REST for DDL
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ query: stmt })
  });
  console.log(stmt.slice(0, 60), "→", res.status);
}
