/**
 * Spectrum app lifecycle wrapper.
 * Creates and stops a Photon Spectrum iMessage provider.
 * Requires Bun runtime — do not import from Node services.
 */
import { Spectrum } from "spectrum-ts";
import type { SpectrumApp } from "spectrum-ts";
import { resolvePhotonConfig } from "./config.mjs";

let _app: SpectrumApp | null = null;

export async function createSpectrumApp(): Promise<SpectrumApp> {
  const cfg = resolvePhotonConfig({ liveOnly: true });

  _app = new Spectrum({
    projectId: cfg.projectId,
    projectSecret: cfg.projectSecret,
    providers: ["imessage"]
  });

  await _app.start();
  return _app;
}

export async function stopSpectrumApp(): Promise<void> {
  if (_app) {
    try {
      await _app.stop();
    } catch {
      // best-effort cleanup
    }
    _app = null;
  }
}

export function getSpectrumApp(): SpectrumApp | null {
  return _app;
}
