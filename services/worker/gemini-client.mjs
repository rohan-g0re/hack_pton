import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class GeminiRateLimitError extends Error {
  /** @param {number} retryAfterMs */
  constructor(retryAfterMs) {
    super(`Gemini rate limited — retry after ${Math.round(retryAfterMs / 1000)}s`);
    this.name = "GeminiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** @param {string} name */
export function readPrompt(name) {
  return fs.readFileSync(path.join(__dirname, "prompts", name), "utf8");
}

/**
 * Call Gemini Vision and return parsed JSON.
 * Throws GeminiRateLimitError on 429 so callers can back off appropriately.
 */
export async function callGeminiVisionJson({ prompt, imageBase64, mimeType = "image/jpeg", apiKey, model }) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const m = model || process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";
  const gm = genAI.getGenerativeModel({ model: m });

  let result;
  try {
    result = await gm.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: imageBase64 } }
    ]);
  } catch (err) {
    if (err?.status === 429) {
      // Parse suggested retry delay from error details
      let retryMs = 60_000;
      const retryInfo = err?.errorDetails?.find(d => d["@type"]?.includes("RetryInfo"));
      if (retryInfo?.retryDelay) {
        const secs = parseFloat(retryInfo.retryDelay);
        if (isFinite(secs)) retryMs = Math.ceil(secs * 1000) + 2000;
      }
      throw new GeminiRateLimitError(retryMs);
    }
    throw err;
  }

  const text = result.response.text();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 120)}`);
  }
  const raw = text.slice(start, end + 1);
  return JSON.parse(raw);
}
