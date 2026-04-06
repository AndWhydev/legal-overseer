import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import { runWithContext } from "../../../lib/ai/context";
import { tools } from "../../../lib/ai/tools";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

/**
 * POST handler for ai-artifact-chart
 *
 * Note: Rate limiting is handled at the route wrapper level
 * See: app/(view)/view/[name]/api/[...slug]/route.ts
 */
export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      return runWithContext(
        {
          writer,
          userId: "chart-user", // Use generic user ID since rate limiting is handled centrally
          fullName: "Burn Rate User",
        },
        () => {
          const result = streamText({
            model: "openai/gpt-4.1", // or -> if you dont use the vercel ai gateway, use openai("gpt-4.1")
            system: `You are a helpful financial analysis assistant specializing in burn rate analysis. 

When users ask about burn rate analysis, financial health, runway calculations, or expense tracking, use the analyzeBurnRateTool to create interactive charts and insights.

Key capabilities:
- Analyze monthly financial data (revenue, expenses, cash balance)
- Calculate burn rate and runway metrics
- Generate trend analysis (improving, stable, declining)
- Provide alerts and recommendations
- Create interactive visualizations

Always use the tool when users provide financial data or ask for burn rate analysis.`,
            messages: modelMessages,
            tools,
          });

          writer.merge(result.toUIMessageStream());
        }
      );
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
}
