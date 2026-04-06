import { gateway, streamText } from "ai";

import { getVideoPrompt } from "../../../lib/catalog";
import { checkRateLimit, getClientIP } from "../../../lib/rate-limit";

export const maxDuration = 30;

const MAX_PROMPT_LENGTH = 2000;
const DEFAULT_MODEL = "google/gemini-3-flash";

export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt?: string };

  const sanitizedPrompt = String(prompt ?? "").slice(0, MAX_PROMPT_LENGTH);

  const clientIP = getClientIP(req);
  const { success } = await checkRateLimit(`json-render-remotion-${clientIP}`);

  if (!success) {
    return Response.json(
      {
        error:
          "Rate limit hit. You've reached the generation limit for now. Please try again later.",
      },
      { status: 429 }
    );
  }

  const result = streamText({
    model: gateway(DEFAULT_MODEL),
    prompt: sanitizedPrompt,
    system: getVideoPrompt(),
  });

  // Cached example with claude sonnet
  // const result = streamText({
  //   model: gateway(process.env.AI_GATEWAY_MODEL ?? DEFAULT_MODEL),
  //   messages: [
  //     {
  //       role: "system",
  //       content: getVideoPrompt(),
  //       providerOptions: {
  //         anthropic: { cacheControl: { type: "ephemeral" } },
  //       },
  //     },
  //     {
  //       role: "user",
  //       content: sanitizedPrompt,
  //     },
  //   ],
  // });

  return result.toTextStreamResponse();
}
