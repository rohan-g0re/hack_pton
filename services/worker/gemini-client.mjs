export class GeminiRateLimitError extends Error {
  constructor(retryAfterMs) {
    super(`Gemini rate limited — retry after ${Math.round(retryAfterMs / 1000)}s`);
    this.name = "GeminiRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

const ROBOTICS_MODEL = "gemini-robotics-er-1.6-preview";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${ROBOTICS_MODEL}:generateContent`;

/**
 * Call Gemini Robotics ER 1.6 with an image and a task-orchestration prompt.
 *
 * Returns { reasoning: string, calls: [{ function: string, args: [...] }] }
 *
 * The prompt must define available functions (Python-docstring style) and ask
 * the model to reason then output a JSON array of function calls.
 */
export async function callRoboticsER({ prompt, imageBase64, mimeType = "image/jpeg" }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.5,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error(`Gemini network error: ${err.message}`);
  }

  if (res.status === 429) {
    let retryMs = 60_000;
    try {
      const j = await res.json();
      const retryInfo = j?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"));
      if (retryInfo?.retryDelay) {
        const secs = parseFloat(retryInfo.retryDelay);
        if (isFinite(secs)) retryMs = Math.ceil(secs * 1000) + 2000;
      }
    } catch { /* ignore */ }
    throw new GeminiRateLimitError(retryMs);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Model outputs: reasoning paragraph(s) followed by JSON array of function calls
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  // Model refused or couldn't identify the scene — return empty calls with reasoning
  if (start === -1 || end === -1) {
    return { reasoning: text.trim(), calls: [] };
  }

  const reasoning = text.slice(0, start).trim();
  let calls = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(calls)) calls = [];

  return { reasoning, calls };
}
