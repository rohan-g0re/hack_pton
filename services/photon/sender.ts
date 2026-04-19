/**
 * Sends an iMessage through a Spectrum app instance.
 * Keeps the Photon SDK surface isolated here so the rest of the agent can be tested without it.
 * Requires Bun runtime.
 */
import type { SpectrumApp } from "spectrum-ts";

export interface SendResult {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  permanent?: boolean;
  onboardingBlocked?: boolean;
}

const ONBOARDING_ERROR_PATTERNS = [
  /target not allowed/i,
  /recipient not allowed/i,
  /not in whitelist/i,
  /invite.*required/i
];

const PERMANENT_ERROR_PATTERNS = [
  /invalid phone/i,
  /malformed/i,
  /unsupported recipient/i
];

function classifyError(err: unknown): { permanent: boolean; onboardingBlocked: boolean; errorCode: string; errorMessage: string } {
  const msg = err instanceof Error ? err.message : String(err);

  if (ONBOARDING_ERROR_PATTERNS.some(p => p.test(msg))) {
    return { permanent: false, onboardingBlocked: true, errorCode: "onboarding_blocked", errorMessage: msg };
  }
  if (PERMANENT_ERROR_PATTERNS.some(p => p.test(msg))) {
    return { permanent: true, onboardingBlocked: false, errorCode: "permanent_error", errorMessage: msg };
  }
  return { permanent: false, onboardingBlocked: false, errorCode: "retryable_error", errorMessage: msg };
}

export async function sendMessage(app: SpectrumApp, { toPhone, body }: { toPhone: string; body: string }): Promise<SendResult> {
  try {
    await app.send({ to: toPhone, text: body, provider: "imessage" });
    return { ok: true };
  } catch (err) {
    const classification = classifyError(err);
    return { ok: false, ...classification };
  }
}
