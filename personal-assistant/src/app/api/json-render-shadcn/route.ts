import { gateway, streamText } from "ai";

import { catalog } from "../../../lib/catalog";
import { checkRateLimit, getClientIP } from "../../../lib/rate-limit";
import {
  generateRequestBodySchema,
  parseRequestBody,
} from "../../../lib/request-utils";

export const maxDuration = 60;

export async function POST(request: Request) {
  const identifier = getClientIP(request);
  const rateLimit = await checkRateLimit(identifier);

  if (!rateLimit.success) {
    return new Response(
      "Rate limit hit. You've reached the generation limit for now. Please try again later.",
      {
        status: 429,
        headers: rateLimit.headers,
      }
    );
  }

  const parsed = await parseRequestBody(request, generateRequestBodySchema);
  if (!parsed.success) {
    return parsed.error;
  }

  const { prompt, currentTree, state, context } = parsed.data;
  const resolvedCurrentTree = currentTree ?? context?.currentTree;
  const resolvedState = state ?? context?.state;

  const systemPrompt = catalog.prompt();
  const contextParts: string[] = [];
  if (resolvedCurrentTree) {
    contextParts.push(
      `Current UI spec:\n${JSON.stringify(resolvedCurrentTree, null, 2)}`
    );
  }
  if (resolvedState && Object.keys(resolvedState).length > 0) {
    contextParts.push(
      `Current form/state values:\n${JSON.stringify(resolvedState, null, 2)}`
    );
  }
  const contextPrompt =
    contextParts.length > 0 ? `\n\n${contextParts.join("\n\n")}` : "";

  const result = streamText({
    model: gateway("anthropic/claude-sonnet-4.6"),
    system: systemPrompt + contextPrompt,
    prompt,
  });

  return result.toTextStreamResponse();
}
