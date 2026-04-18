import { NextRequest } from "next/server";
import {
  addTickListener,
  getPerceptionState,
  removeTickListener,
} from "@/lib/perception-loop";
import type { PerceptionState } from "@/lib/globals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const useSSE = req.nextUrl.searchParams.get("sse") === "1";

  if (!useSSE) {
    return new Response(JSON.stringify(getPerceptionState()), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let listener: ((state: PerceptionState) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const fn = (state: PerceptionState) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
        } catch {
          if (listener) {
            removeTickListener(listener);
            listener = null;
          }
        }
      };
      listener = fn;
      addTickListener(fn);

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(getPerceptionState())}\n\n`)
      );
    },
    cancel() {
      if (listener) {
        removeTickListener(listener);
        listener = null;
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
