export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs async work on an interval; isolates errors so one failure does not kill the loop.
 */
export function startInterval(name, intervalMs, fn) {
  let stopped = false;

  async function tick() {
    if (stopped) {
      return;
    }
    try {
      await fn();
    } catch (error) {
      console.error(`[${name}]`, error);
    } finally {
      if (!stopped) {
        setTimeout(tick, intervalMs);
      }
    }
  }

  tick();

  return () => {
    stopped = true;
  };
}
