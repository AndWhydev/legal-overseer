"use client";

import { immutableSetByPath } from "@json-render/core/store-utils";
import {
  ActionProvider,
  StateProvider,
  useUIStream,
  ValidationProvider,
  VisibilityProvider,
} from "@json-render/react";
import { ThreeCanvas } from "@json-render/react-three-fiber";
import { CheckIcon, Loader2Icon, SparklesIcon, Undo2Icon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { registry } from "../lib/registry";

const API_URL = "/view/json-render-threejs/api/json-render-threejs";

type ScenePreset = {
  label: string;
  prompt: string;
  intent: string;
};

const SCENE_PRESETS: ScenePreset[] = [
  {
    label: "Glass Product Stage",
    intent: "refractive glass + reflections + sparkles",
    prompt:
      "Create a premium studio product hero. Build a clean stage with Backdrop (floor 1.6, segments 20, receiveShadow true) and ReflectorPlane (mirror 0.72, blur [320,110], resolution 1024, color '#0f172a', position [0,0,0], rotation [-1.5708,0,0]). Center one large GlassSphere (radius 1, transmission 0.95, thickness 0.5, roughness 0.04, chromaticAberration 0.06, ior 1.5, position [0,1.15,0]) wrapped in Float (speed 1.2, floatIntensity 0.8). Add two accent supports: GlassBox (width 0.5, height 0.5, depth 0.5, transmission 0.9, thickness 0.3, roughness 0.06, position [-1.6,0.55,-0.4]) and GlassBox (width 0.35, height 0.9, depth 0.35, transmission 0.9, thickness 0.3, roughness 0.06, position [1.5,0.7,0.3]). Add ContactShadows (opacity 0.58, blur 2.6, position [0,-0.01,0]) and subtle Sparkles (count 80, speed 0.35, size 1.6, color '#ffffff', scale [7,5,7]). Use Environment preset 'studio'. Lighting: AmbientLight intensity 0.25, DirectionalLight intensity 1.4 position [4,7,4] castShadow, PointLight color '#bfdbfe' intensity 1.2 position [-3,2,2]. Add EffectComposer with Bloom (intensity 0.65, luminanceThreshold 0.38, mipmapBlur true) and Vignette (offset 0.48, darkness 0.52). PerspectiveCamera position [4.4,2.8,6] fov 42. OrbitControls autoRotate true autoRotateSpeed 0.85.",
  },
  {
    label: "Deep Space",
    intent: "stars + warp tunnel + glowing geometry",
    prompt:
      "Build an epic deep space scene. Add Stars (radius 100, depth 50, count 5000, fade true). Place a WarpTunnel (ringCount 40, radius 8, length 30, speed 2, tubeRadius 0.08, color1 '#4f46e5', color2 '#7c3aed', position [0,0,-15]). Center a TorusKnot (p 3, q 2, radius 1.2, tube 0.35, material: color '#1e1b4b', metalness 1, roughness 0.1, emissive '#818cf8', emissiveIntensity 3) wrapped in Spin (speed 0.8, axis 'y'). Add a DistortSphere (radius 0.4, speed 3, distort 0.5, color '#c084fc', metalness 0.9, roughness 0.2, position [2.5, 1, -1]) wrapped in Float (speed 2, floatIntensity 1.5). Add Sparkles (count 150, speed 0.3, size 1.5, color '#a78bfa', scale [10,10,10]). AmbientLight intensity 0.1. PointLight (color '#818cf8', intensity 3, position [0,2,0]). PointLight (color '#c084fc', intensity 2, position [3,0,-2]). EffectComposer with Bloom (intensity 1.2, luminanceThreshold 0.2, mipmapBlur true). PerspectiveCamera position [0,2,8] fov 50. OrbitControls autoRotate true autoRotateSpeed 0.5.",
  },
  {
    label: "Neon Dreamscape",
    intent: "emissive glow + mirror floor + bloom",
    prompt:
      "Design a cinematic neon corridor scene. Start with ReflectorPlane (mirror 0.88, blur [420,150], resolution 1024, color '#05070f', position [0,0,0], rotation [-1.5708,0,0]) for a wet floor. Create 6 RoundedBox pillars (width 0.38, height 3.2, depth 0.38, radius 0.08, smoothness 4) arranged in two rows along z: left x=-1.7 and right x=1.7 at z=[-3.5,-1,1.5], each with dark base color '#111827', metalness 0.9, roughness 0.12, plus emissive accents cycling '#f43f5e', '#3b82f6', '#22d3ee', '#a855f7', '#10b981', '#fb7185' at emissiveIntensity 4.2. Place a hero DistortSphere (radius 0.85, speed 2.2, distort 0.32, color '#111827', emissive '#22d3ee', emissiveIntensity 3.2, metalness 0.95, roughness 0.1, position [0,1.45,0]) wrapped in Float (speed 0.9, floatIntensity 0.7). Add Fog (color '#070714', near 2.2, far 16), Sparkles (count 60, speed 0.25, size 1.2, color '#93c5fd', scale [6,4,8]), AmbientLight intensity 0.05, PointLight color '#f43f5e' intensity 2.6 position [-1.8,2.8,1.5], and PointLight color '#22d3ee' intensity 2.8 position [1.8,2.2,-1]. Add EffectComposer with Bloom (intensity 1.45, luminanceThreshold 0.12, mipmapBlur true) and Vignette (offset 0.4, darkness 0.72). PerspectiveCamera position [0,2.1,7.2] fov 50. OrbitControls autoRotate true autoRotateSpeed 0.75.",
  },
  {
    label: "Cloud Observatory",
    intent: "sky + clouds + floating glass",
    prompt:
      "Create a serene sunrise cloud observatory. Add Sky (sunPosition [100,20,100], rayleigh 2.2, turbidity 7). Place three Cloud layers: Cloud opacity 0.5 speed 0.24 color '#ffffff' position [-3,2.4,-2], Cloud opacity 0.45 speed 0.2 color '#f8fafc' position [2,3.1,-3], Cloud opacity 0.4 speed 0.28 color '#f1f5f9' position [0,1.9,1.5]. Build a floating cluster of 4 GlassBox forms with explicit sizing: [0.9,0.9,0.9] at [-1.2,1.4,-0.8], [0.7,1.1,0.7] at [0.4,2,0.3], [1.1,0.6,0.8] at [1.5,1.1,-0.2], [0.5,0.5,1] at [0,2.6,-1.2]; all with transmission 0.92, thickness 0.32, roughness 0.05, chromaticAberration 0.04, and each wrapped in Float with speeds 0.8, 1.1, 1.3, 1.5. Add Sparkles (count 90, speed 0.2, size 1, color '#fbbf24', scale [12,8,12]). Stage with Plane (width 32, height 32, position [0,-2,0], rotation [-1.5708,0,0], material: color '#e2e8f0', roughness 1, metalness 0). Lighting: AmbientLight intensity 0.52 color '#fef3c7', DirectionalLight intensity 1.6 color '#fde68a' position [10,8,5] castShadow, PointLight color '#f59e0b' intensity 1.1 position [-4,3,2]. Add EffectComposer with Bloom (intensity 0.45, luminanceThreshold 0.58, mipmapBlur true) and Vignette (offset 0.55, darkness 0.35). PerspectiveCamera position [5.2,3,8.2] fov 45. OrbitControls autoRotate true autoRotateSpeed 0.45.",
  },
  {
    label: "Portal Gallery",
    intent: "portal effect + backdrop staging",
    prompt:
      "Build a dramatic portal gallery installation. Use Backdrop (floor 1.7, segments 24, receiveShadow true) for a clean curved stage and Environment preset 'lobby'. Create a freestanding frame Box (width 2.3, height 3.2, depth 0.18, position [0,1.7,0], material: color '#0f172a', metalness 0.85, roughness 0.22). Add MeshPortalMaterial (blend 1) as a child of that frame. Inside the portal, render a mini world: Stars (radius 55, depth 35, count 3200, fade true), DistortSphere (radius 0.6, speed 2.8, distort 0.45, color '#1e1b4b', emissive '#f43f5e', emissiveIntensity 2.6, metalness 0.9, roughness 0.12, position [0,0,-2]) wrapped in Spin (speed 0.6, axis 'y'), and AmbientLight intensity 0.26 plus PointLight color '#f43f5e' intensity 1.6 position [0,1,-1.2]. Outside the portal, add two slim pedestals with Box (width 0.35, height 1, depth 0.35, positions [-1.9,0.5,0.6] and [1.9,0.5,0.6], color '#1f2937', metalness 0.6, roughness 0.35). Lighting: AmbientLight intensity 0.22, SpotLight intensity 2.2 position [-3.1,4.2,2.2] angle 0.48 penumbra 0.8 castShadow, SpotLight intensity 2.2 position [3.1,4.2,2.2] angle 0.48 penumbra 0.8 castShadow. Add ContactShadows (opacity 0.62, blur 2.2, position [0,-0.01,0]). EffectComposer with Bloom (intensity 0.62, luminanceThreshold 0.45, mipmapBlur true) and Vignette (offset 0.5, darkness 0.5). PerspectiveCamera position [0,2.1,5.3] fov 48. OrbitControls autoRotate true autoRotateSpeed 0.35.",
  },
  {
    label: "Kinetic Sculpture",
    intent: "orbit + spin + pulse animations",
    prompt:
      "Create an abstract kinetic sculpture centerpiece in a dark studio. Use Environment preset 'night' with ContactShadows (opacity 0.45, blur 3, position [0,-0.01,0]). Hero object: DistortSphere (radius 0.82, speed 2.1, distort 0.42, color '#111827', emissive '#6366f1', emissiveIntensity 2.6, metalness 0.98, roughness 0.14, position [0,1.45,0]) wrapped in Pulse (speed 1, min 0.9, max 1.1). Add three orbiting TorusKnot accents, each wrapped in Orbit: (1) TorusKnot radius 0.32 tube 0.1 p 2 q 3 color '#1f2937' emissive '#6366f1' emissiveIntensity 2.8 at orbit radius 2.4 speed 0.35 tilt 0.1; (2) TorusKnot radius 0.28 tube 0.09 p 3 q 2 color '#1f2937' emissive '#ec4899' emissiveIntensity 2.8 at orbit radius 2.9 speed 0.48 tilt 0.35; (3) TorusKnot radius 0.3 tube 0.1 p 2 q 5 color '#1f2937' emissive '#14b8a6' emissiveIntensity 2.8 at orbit radius 3.3 speed 0.58 tilt 0.52. Add two small Sphere satellites (radius 0.14, color '#111827', emissive '#fbbf24', emissiveIntensity 4.5) each wrapped in Orbit (radius 1.5 speed 1.05 tilt 0.2). Add HtmlLabel (text 'KINETIC', transform true, distanceFactor 10, position [0,3.4,0], color '#a5b4fc'). Lighting: AmbientLight intensity 0.12, PointLight color '#6366f1' intensity 2.2 position [0,3.2,0], PointLight color '#ec4899' intensity 1.4 position [-2,1.5,1]. Add EffectComposer with Bloom (intensity 1.05, luminanceThreshold 0.2, mipmapBlur true) and Vignette (offset 0.5, darkness 0.55). PerspectiveCamera position [5.1,3,5.2] fov 45. OrbitControls autoRotate true autoRotateSpeed 0.58.",
  },
  {
    label: "Crystal Cave",
    intent: "glass clusters + point lights + fog",
    prompt:
      "Build a moody crystal cave composition. Start with a dark cavern floor Plane (width 26, height 26, position [0,-0.5,0], rotation [-1.5708,0,0], material: color '#0b1020', roughness 1, metalness 0). Scatter an explicit crystal field: GlassSphere radius 0.9 at [-1.6,0.5,-0.8], GlassSphere radius 0.6 at [1.3,0.2,-1.2], GlassSphere radius 0.42 at [0.2,1.1,0.5], GlassSphere radius 0.35 at [-0.3,1.6,-0.2], GlassSphere radius 0.5 at [1.9,0.9,0.8], all with transmission 0.92, thickness 0.5, roughness 0.02, chromaticAberration 0.08, ior 1.65. Add three GlassBox crystals: size [0.8,1.1,0.6] at [-2,0.55,1], [0.6,0.9,0.6] at [0.9,1.4,-0.1], [1,0.5,0.7] at [2.2,0.25,0.2], each with transmission 0.9, thickness 0.4, chromaticAberration 0.06. Wrap two elevated crystals in Float (speed 0.7 and 1.2, floatIntensity 0.9). Add colored gem lighting: PointLight '#f43f5e' intensity 2.1 position [-2,1,1], PointLight '#3b82f6' intensity 2.2 position [2,2,-1], PointLight '#a855f7' intensity 1.6 position [0,0.6,2], PointLight '#10b981' intensity 1.7 position [1,3,0]. Add Stars (radius 80, depth 30, count 2200, fade true), Fog (color '#0c0a1a', near 3, far 14), AmbientLight intensity 0.08, and Sparkles (count 70, speed 0.24, size 1, color '#e2e8f0', scale [8,6,8]). Add EffectComposer with Bloom (intensity 0.85, luminanceThreshold 0.28, mipmapBlur true) and Vignette (offset 0.45, darkness 0.6). PerspectiveCamera position [3.2,2.1,5.2] fov 50. OrbitControls autoRotate true autoRotateSpeed 0.42.",
  },
  {
    label: "Cyberpunk Alley",
    intent: "neon lights + wet ground + camera shake",
    prompt:
      "Design a dense cyberpunk alley at night. Build two rows of tower blocks using 6 Box buildings total: left x=-2.3 and right x=2.3 with z positions [-3.6,-0.6,2.2], each width 1.9 depth 2.1 and heights [6.8,5.9,6.4], material color '#111827' metalness 0.7 roughness 0.32. Add neon trim on building faces using thin RoundedBox strips (width 0.05, depth 0.05, radius 0.02, smoothness 4) with emissive colors '#f43f5e', '#06b6d4', '#a855f7', '#22d3ee' and emissiveIntensity 5.2. Add ReflectorPlane (mirror 0.9, blur [420,210], color '#05070f', position [0,0,0], rotation [-1.5708,0,0]) for wet asphalt reflections. Place a hanging Text3D sign (text 'ENTER', fontSize 0.52, color '#06b6d4', position [0,4.1,-2.8]) and a secondary Text3D sign (text 'NITE', fontSize 0.36, color '#f43f5e', position [-1.6,3.2,1.2]). Add Fog (color '#080a18', near 1, far 13.5), AmbientLight intensity 0.035, PointLight '#f43f5e' intensity 3.1 position [-1,3,2], PointLight '#06b6d4' intensity 3 position [1,2,-1], PointLight '#a855f7' intensity 2.2 position [0,4,0]. Add CameraShake (intensity 0.28, maxYaw 0.05, maxPitch 0.05, maxRoll 0.02). Add EffectComposer with Bloom (intensity 1.55, luminanceThreshold 0.1, mipmapBlur true) and Vignette (offset 0.3, darkness 0.82). PerspectiveCamera position [0,2.1,6.1] fov 55. OrbitControls autoRotate true autoRotateSpeed 0.35.",
  },
];

const LOADING_STAGES = [
  "Planning scene",
  "Placing geometry",
  "Applying materials",
  "Rigging animations",
  "Tuning post-processing",
];

type JsonRenderDemoContentProps = {
  stateRef: React.MutableRefObject<Record<string, unknown>>;
  resetState: () => void;
};

function JsonRenderDemoContent({
  stateRef,
  resetState,
}: JsonRenderDemoContentProps) {
  const [input, setInput] = useState("");
  const [loadingStage, setLoadingStage] = useState(LOADING_STAGES[0]);
  const [justCleared, setJustCleared] = useState(false);
  const clearFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const { spec, isStreaming, error, send, clear } = useUIStream({
    api: API_URL,
  });

  useEffect(() => {
    if (!isStreaming) {
      setLoadingStage(LOADING_STAGES[0]);
      return;
    }

    let stageIndex = 0;
    const interval = setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, LOADING_STAGES.length - 1);
      setLoadingStage(LOADING_STAGES[stageIndex]);
    }, 1200);

    return () => clearInterval(interval);
  }, [isStreaming]);

  useEffect(
    () => () => {
      if (clearFeedbackTimeoutRef.current) {
        clearTimeout(clearFeedbackTimeoutRef.current);
      }
    },
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (text && !isStreaming) {
      const context = spec
        ? {
            currentTree: spec,
            state: stateRef.current,
          }
        : undefined;
      send(text, context);
      setInput("");
    }
  };

  const handlePresetClick = (preset: ScenePreset) => {
    if (!isStreaming) {
      const context = spec
        ? {
            currentTree: spec,
            state: stateRef.current,
          }
        : undefined;
      send(preset.prompt, context);
    }
  };

  const handleClear = useCallback(() => {
    clear();
    resetState();
    setInput("");
    setJustCleared(true);
    if (clearFeedbackTimeoutRef.current) {
      clearTimeout(clearFeedbackTimeoutRef.current);
    }
    clearFeedbackTimeoutRef.current = setTimeout(() => {
      setJustCleared(false);
    }, 900);
  }, [clear, resetState]);

  const hasSpec = Boolean(spec);
  const showOnboarding = !(hasSpec || isStreaming);
  const visiblePresets = SCENE_PRESETS.slice(0, 4);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col p-3 sm:p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-red-800 shadow-sm dark:bg-red-950 dark:text-red-200">
            <p className="font-medium text-sm">Error: {error.message}</p>
          </div>
        )}

        <div className="rounded-[20px] bg-background p-2 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_8px_20px_-12px_rgba(15,23,42,0.2)]">
          <div className="relative aspect-video min-h-[340px] w-full overflow-hidden rounded-[12px] bg-black sm:min-h-[420px]">
            <ThreeCanvas
              camera={{ position: [6, 6, 6], fov: 50 }}
              className="h-full w-full"
              loading={isStreaming}
              registry={registry}
              shadows
              spec={spec}
              style={{ height: "100%", width: "100%" }}
            />

            {showOnboarding && (
              <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-3xl rounded-[20px] bg-background/94 p-2 backdrop-blur-sm">
                  <div className="rounded-[12px] bg-background p-4 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_2px_4px_0px_rgba(15,23,42,0.06)] sm:p-5">
                    <p className="font-medium text-muted-foreground text-xs uppercase tabular-nums">
                      AI 3D Scene Builder
                    </p>
                    <h2 className="mt-1 text-balance font-semibold text-foreground text-xl sm:text-2xl">
                      Pick a preset or type a scene prompt.
                    </h2>
                    <p className="mt-2 text-pretty text-muted-foreground text-sm">
                      Generate stunning Three.js scenes with glass materials,
                      particle effects, post-processing, and animated geometry.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {visiblePresets.map((preset) => (
                        <Button
                          className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
                          data-testid="suggestion"
                          key={preset.label}
                          onClick={() => handlePresetClick(preset)}
                          type="button"
                          variant="outline"
                        >
                          <span className="flex flex-col items-start gap-0.5">
                            <span className="text-sm">{preset.label}</span>
                            <span className="text-muted-foreground text-xs">
                              {preset.intent}
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isStreaming && (
              <div className="pointer-events-none absolute top-3 left-3">
                <div className="inline-flex items-center gap-2 rounded-lg bg-background/88 px-2.5 py-1.5 text-foreground text-xs shadow-sm backdrop-blur-sm">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span className="tabular-nums">{loadingStage}</span>
                </div>
              </div>
            )}

            {!(hasSpec || isStreaming) && (
              <div className="pointer-events-none absolute right-3 bottom-3 left-3">
                <p className="rounded-lg bg-background/78 px-2.5 py-1.5 text-center text-muted-foreground text-xs backdrop-blur-sm">
                  Scene starts empty by design. Choose a preset or describe a
                  scene below.
                </p>
              </div>
            )}
          </div>
        </div>

        <form
          className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={handleSubmit}
        >
          <Input
            className="h-11 rounded-xl"
            disabled={isStreaming}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the 3D scene you want..."
            value={input}
          />
          {hasSpec && (
            <Button
              className={cn("h-11 rounded-xl pr-3.5 pl-3", {
                "text-emerald-600": justCleared,
              })}
              onClick={handleClear}
              type="button"
              variant="outline"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  key={justCleared ? "cleared" : "clear"}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {justCleared ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <Undo2Icon className="size-4" />
                  )}
                </motion.span>
              </AnimatePresence>
              {justCleared ? "Cleared" : "Clear"}
            </Button>
          )}
          <Button
            className="h-11 rounded-xl pr-3.5 pl-3"
            disabled={!input.trim() || isStreaming}
            type="submit"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                initial={{ opacity: 0, scale: 0.9 }}
                key={isStreaming ? "streaming" : "idle"}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {isStreaming ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
              </motion.span>
            </AnimatePresence>
            {isStreaming ? "Generating" : "Generate"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function JsonRenderDemo() {
  const stateRef = useRef<Record<string, unknown>>({});

  const resetState = useCallback(() => {
    stateRef.current = {};
  }, []);

  const handleStateChange = useCallback(
    (
      changesOrPath: Array<{ path: string; value: unknown }> | string,
      value?: unknown
    ) => {
      const changes = Array.isArray(changesOrPath)
        ? changesOrPath
        : [{ path: changesOrPath, value }];
      for (const { path, value: v } of changes) {
        stateRef.current = immutableSetByPath(stateRef.current, path, v);
      }
    },
    []
  );

  return (
    <StateProvider initialState={{}} onStateChange={handleStateChange}>
      <VisibilityProvider>
        <ActionProvider handlers={{}}>
          <ValidationProvider customFunctions={{}}>
            <JsonRenderDemoContent
              resetState={resetState}
              stateRef={stateRef}
            />
          </ValidationProvider>
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
