import { GeminiRateLimitError } from "./gemini-client.mjs";

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs async work on an interval; isolates errors so one failure does not kill the loop.
 * On GeminiRateLimitError, backs off for the suggested retry delay instead of the normal interval.
 */
export function startInterval(name, intervalMs, fn) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    let nextMs = intervalMs;
    try {
      await fn();
    } catch (error) {
      if (error instanceof GeminiRateLimitError) {
        nextMs = error.retryAfterMs;
        console.warn(`[${name}] Gemini rate limited — backing off ${Math.round(nextMs / 1000)}s`);
      } else {
        console.error(`[${name}]`, error);
      }
    } finally {
      if (!stopped) {
        setTimeout(tick, nextMs);
      }
    }
  }

  tick();

  return () => { stopped = true; };
}
