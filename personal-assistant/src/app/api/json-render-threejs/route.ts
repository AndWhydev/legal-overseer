import { gateway, streamText } from "ai";

import { getScenePrompt } from "../../../lib/catalog";
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
      "Rate limit hit for json-render-threejs. You've reached the 3D generation limit for now. Please try again later.",
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

  const systemPrompt = `${getScenePrompt()}

You are generating visually impressive Three.js scenes using @json-render/react-three-fiber.
Your goal is to WOW developers with rich, polished 3D compositions that showcase the full power of the component palette.

Core rules:
- Only use components from the catalog above. Do not invent unsupported component names.
- Always include at least one light source and a PerspectiveCamera + OrbitControls for interactivity.
- For refinements, preserve existing composition and only change what the user requested unless they ask to replace the full scene.
- Return only valid JSON-render scene specs.

Scene complexity:
- Scenes can use up to ~30 elements for complex compositions. Use Group to organize related objects.
- Combine multiple techniques: atmosphere (Stars/Sky/Fog/Cloud) + special materials (GlassSphere/GlassBox/DistortSphere) + animation wrappers (Float/Spin/Orbit/Pulse) + post-processing (EffectComposer > Bloom/Vignette).
- Every scene should feel alive — wrap at least one key object in Float or Spin for ambient motion.

Material craft:
- Push material variety: polished metal (metalness 0.9, roughness 0.1), matte clay (roughness 0.9), glass (use GlassSphere/GlassBox), glowing neon (emissive + emissiveIntensity 2-5 + Bloom).
- When using emissive materials, ALWAYS pair with EffectComposer containing Bloom — emissive without Bloom looks flat.
- Mix 2-3 material styles per scene for visual contrast.

Grounding & staging:
- Match grounding to intent: ContactShadows for product/studio, ReflectorPlane for showroom/wet surfaces, Plane for terrain, Sky for outdoors, Stars for space.
- Use Environment presets (studio, sunset, city, forest, night, warehouse) for realistic reflections on metallic and glass materials.

Fallback behavior:
- If the prompt is underspecified, create a visually striking default: DistortSphere hero wrapped in Float + Environment preset "sunset" + ContactShadows + Sparkles + EffectComposer with Bloom and Vignette + OrbitControls with autoRotate. Make the first impression count.`;

  const contextParts: string[] = [];
  if (resolvedCurrentTree) {
    contextParts.push(
      `Current scene spec:\n${JSON.stringify(resolvedCurrentTree, null, 2)}`
    );
  }
  if (resolvedState && Object.keys(resolvedState).length > 0) {
    contextParts.push(
      `Current scene state values:\n${JSON.stringify(resolvedState, null, 2)}`
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
