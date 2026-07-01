import { NextRequest } from "next/server";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

const MODEL = "gemma-4-31b";
const MAX_COMPLETION_TOKENS = 16384;
// Safety cap: stop looping after this many continuation turns
const MAX_CONTINUE_ITERATIONS = 8;

type Message = { role: string; content: string };

export async function POST(request: NextRequest) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "CEREBRAS_API_KEY is not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { messages: Message[]; system?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, system } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages must be a non-empty array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const initialMessages: Message[] = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  const client = new Cerebras({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = initialMessages;
        let accumulated = "";
        let iterations = 0;

        while (iterations < MAX_CONTINUE_ITERATIONS) {
          iterations++;

          const cerebrasStream = await client.chat.completions.create({
            model: MODEL,
            messages: currentMessages as Parameters<typeof client.chat.completions.create>[0]["messages"],
            stream: true,
            max_completion_tokens: MAX_COMPLETION_TOKENS,
          });

          let finishReason: string | null = null;
          let iterationText = "";

          for await (const chunk of cerebrasStream) {
            const content = chunk.choices[0]?.delta?.content;
            const reason = chunk.choices[0]?.finish_reason;
            if (content) {
              iterationText += content;
              accumulated += content;
              controller.enqueue(encoder.encode(content));
            }
            if (reason) finishReason = reason;
          }

          // If truncated, continue automatically — no visible seam for the user
          if (finishReason === "length" && iterationText.length > 0) {
            currentMessages = [
              ...currentMessages,
              { role: "assistant", content: accumulated },
              {
                role: "user",
                content:
                  "Continue exactly from where you left off. No overlap, no preamble, no explanation — just continue the output.",
              },
            ];
          } else {
            break;
          }
        }

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
