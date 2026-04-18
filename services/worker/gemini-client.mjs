import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * @param {string} name
 */
export function readPrompt(name) {
  return fs.readFileSync(path.join(__dirname, "prompts", name), "utf8");
}

/**
 * Call Gemini with image + text. Returns parsed JSON when model returns JSON text.
 * Requires GEMINI_API_KEY; model defaults to gemini-2.0-flash for hackathon portability.
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

  const result = await gm.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: imageBase64 } }
  ]);

  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  const raw = jsonMatch ? jsonMatch[0] : text;
  return JSON.parse(raw);
}
