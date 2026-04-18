import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (service role for workers; anon for browser if needed).
 * Returns null when env is not configured so the demo can run in-memory only.
 */
export function createSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY;
  const key = serviceRole || anon;
  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
