/**
 * Photon iMessage agent — long-lived Bun process.
 * Drains the photon_outbox, delivers messages via Spectrum, and handles inbound commands.
 * Requires Bun runtime. Start with: bun services/photon/agent.ts
 */
import { createClient } from "@supabase/supabase-js";
import { resolvePhotonConfig } from "./config.mjs";
import { createSpectrumApp, stopSpectrumApp } from "./spectrum-app.ts";
import { sendMessage } from "./sender.ts";
import { routeInboundCommand } from "./command-router.mjs";

const STALE_SENDING_TIMEOUT_MS = 5 * 60 * 1000; // reclaim rows stuck in 'sending' > 5 min

function makeSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function reclaimStaleRows(client: ReturnType<typeof makeSupabaseClient>) {
  const cutoff = new Date(Date.now() - STALE_SENDING_TIMEOUT_MS).toISOString();
  const { error } = await client
    .from("photon_outbox")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "sending")
    .lt("updated_at", cutoff);
  if (error) console.error("[photon-agent] stale reclaim error:", error.message);
}

async function claimBatch(client: ReturnType<typeof makeSupabaseClient>, batchSize: number): Promise<string[]> {
  const { data, error } = await client.rpc("claim_photon_outbox", { batch_size: batchSize });
  if (error) {
    console.error("[photon-agent] claim error:", error.message);
    return [];
  }
  return (data || []) as string[];
}

async function markSent(client: ReturnType<typeof makeSupabaseClient>, outboxId: string, notificationId: string | null) {
  const now = new Date().toISOString();
  await client.from("photon_outbox").update({ status: "sent", updated_at: now }).eq("id", outboxId);
  if (notificationId) {
    await client.from("notifications").update({ delivery_status: "sent", sent_at: now }).eq("id", notificationId);
  }
}

async function markFailed(
  client: ReturnType<typeof makeSupabaseClient>,
  row: Record<string, unknown>,
  result: { permanent?: boolean; onboardingBlocked?: boolean; errorCode?: string; errorMessage?: string }
) {
  const attempts = (Number(row.attempts) || 0) + 1;
  const now = new Date().toISOString();
  const status = result.onboardingBlocked ? "blocked" : result.permanent ? "failed" : "pending";

  // Exponential backoff for retryable errors, capped at 30 minutes.
  let nextAttemptAt: string | null = null;
  if (status === "pending") {
    const backoffMs = Math.min(attempts * attempts * 30000, 30 * 60 * 1000);
    nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();
  }

  await client.from("photon_outbox").update({
    status,
    attempts,
    error_code: result.errorCode || null,
    error_message: result.errorMessage ? result.errorMessage.slice(0, 500) : null,
    next_attempt_at: nextAttemptAt,
    updated_at: now
  }).eq("id", String(row.id));

  const notifStatus = result.onboardingBlocked ? "blocked" : "failed";
  if (row.notification_id) {
    await client.from("notifications").update({ delivery_status: notifStatus }).eq("id", String(row.notification_id));
  }
}

async function processBatch(client: ReturnType<typeof makeSupabaseClient>, ids: string[], app: Awaited<ReturnType<typeof createSpectrumApp>>) {
  if (!ids.length) return;

  const { data: rows, error } = await client
    .from("photon_outbox")
    .select("*")
    .in("id", ids);

  if (error || !rows) {
    console.error("[photon-agent] fetch batch error:", error?.message, "— resetting claimed rows to pending");
    // Reset rows to pending so they are not stuck in 'sending' state.
    await client
      .from("photon_outbox")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .in("id", ids)
      .eq("status", "sending");
    return;
  }

  for (const row of rows) {
    const result = await sendMessage(app, {
      toPhone: String(row.recipient_phone),
      body: String(row.message_body)
    });

    if (result.ok) {
      console.log(`[photon-agent] sent outbox:${row.id}`);
      await markSent(client, String(row.id), row.notification_id ? String(row.notification_id) : null);
    } else {
      const category = result.onboardingBlocked ? "onboarding_blocked" : result.permanent ? "permanent" : "retryable";
      console.warn(`[photon-agent] send failed outbox:${row.id} category:${category} error:${result.errorMessage}`);
      await markFailed(client, row, result);
    }
  }
}

async function main() {
  const cfg = resolvePhotonConfig({ liveOnly: true });
  const client = makeSupabaseClient();

  console.log("[photon-agent] starting");
  const app = await createSpectrumApp();
  console.log("[photon-agent] Spectrum app ready");

  await reclaimStaleRows(client);

  // Inbound message loop (non-blocking)
  ;(async () => {
    try {
      for await (const ctx of app.messages()) {
        const sender = ctx.message?.sender || "";
        const text = ctx.message?.text || "";
        if (!sender || !text) continue;
        try {
          const reply = await routeInboundCommand(client, { senderPhone: sender, text });
          if (reply) await ctx.reply(reply);
        } catch (err) {
          console.error("[photon-agent] inbound command error:", (err as Error).message);
        }
      }
    } catch (err) {
      console.error("[photon-agent] inbound message loop error:", (err as Error).message);
    }
  })();

  // Outbox drain loop — store handle so shutdown can cancel the next scheduled tick.
  let pollHandle: ReturnType<typeof setTimeout> | null = null;
  let shuttingDown = false;

  const poll = async () => {
    if (shuttingDown) return;
    try {
      const ids = await claimBatch(client, cfg.batchSize);
      if (ids.length) await processBatch(client, ids, app);
    } catch (err) {
      console.error("[photon-agent] poll error:", (err as Error).message);
    }
    if (!shuttingDown) {
      pollHandle = setTimeout(poll, cfg.pollMs);
    }
  };

  await poll();

  // Graceful shutdown — cancel pending poll tick, stop Spectrum, then exit.
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[photon-agent] shutting down");
    if (pollHandle !== null) clearTimeout(pollHandle);
    await stopSpectrumApp();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(err => {
  console.error("[photon-agent] fatal:", err.message);
  process.exit(1);
});
