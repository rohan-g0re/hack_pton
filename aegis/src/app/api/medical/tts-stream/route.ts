import "@/lib/globals";

if (!globalThis.ttsQueue) globalThis.ttsQueue = [];
if (!globalThis.ttsListeners) globalThis.ttsListeners = [];

export function triggerTTS(message: string) {
  globalThis.ttsQueue.push(message);
  for (const listener of globalThis.ttsListeners) {
    try {
      listener(message);
    } catch {
      // ignore
    }
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let registered: ((msg: string) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const listener = (msg: string) => {
        try {
          const data = JSON.stringify({ speak: msg });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // controller may be closed — remove listener
          if (registered) {
            globalThis.ttsListeners = globalThis.ttsListeners.filter((l) => l !== registered);
            registered = null;
          }
        }
      };

      registered = listener;
      globalThis.ttsListeners.push(listener);

      const pending = [...globalThis.ttsQueue];
      globalThis.ttsQueue = [];
      for (const msg of pending) {
        const data = JSON.stringify({ speak: msg });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }
    },
    cancel() {
      if (registered) {
        globalThis.ttsListeners = globalThis.ttsListeners.filter((l) => l !== registered);
        registered = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
