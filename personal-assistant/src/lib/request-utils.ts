import { z } from "zod";

export const generateRequestBodySchema = z.object({
  prompt: z.string().min(1),
  currentTree: z.record(z.unknown()).optional(),
  state: z.record(z.unknown()).optional(),
  context: z
    .object({
      currentTree: z.record(z.unknown()).optional(),
      state: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export type GenerateRequestBody = z.infer<typeof generateRequestBodySchema>;

export async function parseRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: Response }> {
  try {
    const jsonBody = await request.json();
    const parsed = schema.safeParse(jsonBody);
    if (!parsed.success) {
      return {
        success: false,
        error: new Response("Invalid request body", { status: 400 }),
      };
    }
    return { success: true, data: parsed.data };
  } catch {
    return {
      success: false,
      error: new Response("Invalid request body", { status: 400 }),
    };
  }
}
