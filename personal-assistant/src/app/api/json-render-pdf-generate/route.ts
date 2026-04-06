import type { Spec } from "@json-render/core";
import { buildUserPrompt } from "@json-render/core";
import { gateway, streamText } from "ai";

import { pdfCatalog } from "../../../lib/catalog";
import { checkRateLimit, getClientIP } from "../../../lib/rate-limit";

export const maxDuration = 60;

const DEFAULT_MODEL = "google/gemini-3-flash";

export async function POST(req: Request) {
  const { prompt, startingSpec } = (await req.json()) as {
    prompt: string;
    startingSpec?: Spec | null;
  };

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const identifier = getClientIP(req);
  const { success } = await checkRateLimit(identifier);
  if (!success) {
    return Response.json(
      {
        error:
          "Rate limit hit. You've reached the generation limit for now. Please try again later.",
      },
      { status: 429 }
    );
  }

  const userPrompt = buildUserPrompt({
    prompt,
    currentSpec: startingSpec,
  });

  const result = streamText({
    model: gateway(process.env.AI_GATEWAY_MODEL ?? DEFAULT_MODEL),
    system: pdfCatalog.prompt(),
    prompt: userPrompt,
    temperature: 0.7,
  });

  return result.toTextStreamResponse();
}
