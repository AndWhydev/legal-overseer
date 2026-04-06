"use client";

import type { Spec } from "@json-render/core";
import { createSpecStreamCompiler } from "@json-render/core";
import {
  CheckIcon,
  DownloadIcon,
  Loader2Icon,
  SparklesIcon,
  SquareIcon,
  Undo2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { examples } from "../lib/examples";
import { EmptyState } from "./empty-state";

const API_BASE = "/view/json-render-image/api";
const PREVIEW_REFRESH_INTERVAL_MS = 2000;
const MAX_DIMENSION = 4096;
const RATE_LIMIT_ERROR_MESSAGE =
  "Rate limit hit. You've reached the generation limit for now. Please try again later.";

const LOADING_STAGES = [
  "Planning composition",
  "Building elements",
  "Applying typography",
  "Rendering preview",
  "Finalizing output",
];

type Mode = "scratch" | "example";
type OutputFormat = "svg" | "png";

type Selection = {
  mode: Mode;
  exampleName?: string;
};

function clampDimension(value: number): number {
  return Math.max(64, Math.min(MAX_DIMENSION, Math.round(value)));
}

function parseDimensionInput(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return clampDimension(parsed);
}

function extractFrameSize(spec: Spec | null): {
  width: number;
  height: number;
} {
  const fallback = { width: 1200, height: 630 };
  if (!(spec?.root && spec.elements)) {
    return fallback;
  }

  const root = spec.elements[spec.root] as
    | { props?: { width?: unknown; height?: unknown } }
    | undefined;
  const width =
    typeof root?.props?.width === "number"
      ? clampDimension(root.props.width)
      : fallback.width;
  const height =
    typeof root?.props?.height === "number"
      ? clampDimension(root.props.height)
      : fallback.height;

  return { width, height };
}

function isRenderableSpec(spec: Spec): boolean {
  if (!(spec.root && spec.elements)) {
    return false;
  }
  return spec.elements[spec.root] !== undefined;
}

async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: string } | null;
  if (typeof body?.error === "string" && body.error.length > 0) {
    return body.error;
  }

  const text = await response.text().catch(() => "");
  if (text.trim().length > 0) {
    return text;
  }

  if (response.status === 429) {
    return RATE_LIMIT_ERROR_MESSAGE;
  }

  return fallbackMessage;
}

export function JsonRenderImageDemo() {
  const { theme } = useTheme();
  const [selection, setSelection] = useState<Selection>({ mode: "scratch" });
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<Spec | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("png");
  const [widthInput, setWidthInput] = useState("1200");
  const [heightInput, setHeightInput] = useState("630");
  const [loadingStage, setLoadingStage] = useState(LOADING_STAGES[0]);
  const [justCleared, setJustCleared] = useState(false);

  const previewUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clearFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const currentExample = useMemo(
    () =>
      selection.mode === "example"
        ? (examples.find((item) => item.name === selection.exampleName) ?? null)
        : null,
    [selection]
  );

  const activeSpec = generatedSpec ?? currentExample?.spec ?? null;
  const frameSize = useMemo(() => extractFrameSize(activeSpec), [activeSpec]);

  useEffect(() => {
    if (!activeSpec) {
      return;
    }
    setWidthInput(String(frameSize.width));
    setHeightInput(String(frameSize.height));
  }, [activeSpec, frameSize.height, frameSize.width]);

  useEffect(() => {
    if (!generating) {
      setLoadingStage(LOADING_STAGES[0]);
      return;
    }

    let stageIndex = 0;
    const interval = setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, LOADING_STAGES.length - 1);
      setLoadingStage(LOADING_STAGES[stageIndex]);
    }, 1200);

    return () => clearInterval(interval);
  }, [generating]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      if (clearFeedbackTimeoutRef.current) {
        clearTimeout(clearFeedbackTimeoutRef.current);
      }
    },
    []
  );

  const fetchPreview = useCallback(
    async (spec: Spec, signal?: AbortSignal) => {
      const width = parseDimensionInput(widthInput, frameSize.width);
      const height = parseDimensionInput(heightInput, frameSize.height);

      const res = await fetch(`${API_BASE}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec,
          format,
          width,
          height,
          theme,
        }),
        signal,
      });

      if (!res.ok) {
        throw new Error("Failed to render image preview");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const previous = previewUrlRef.current;
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setError(null);

      if (previous) {
        URL.revokeObjectURL(previous);
      }
    },
    [format, frameSize.height, frameSize.width, heightInput, theme, widthInput]
  );

  const generatedSpecRef = useRef<Spec | null>(null);
  generatedSpecRef.current = generatedSpec;
  const lastRefreshSpec = useRef("");

  useEffect(() => {
    if (!(generating && generatedSpec)) {
      return;
    }

    const interval = setInterval(() => {
      const spec = generatedSpecRef.current;
      if (!spec) {
        return;
      }

      const specKey = JSON.stringify(spec);
      if (specKey === lastRefreshSpec.current) {
        return;
      }

      lastRefreshSpec.current = specKey;
      setRefreshing(true);
      fetchPreview(spec)
        .catch(() => {})
        .finally(() => setRefreshing(false));
    }, PREVIEW_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchPreview, generatedSpec, generating]);

  useEffect(() => {
    if (!activeSpec) {
      const previous = previewUrlRef.current;
      previewUrlRef.current = null;
      setPreviewUrl(null);
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return;
    }
    if (generating && !isRenderableSpec(activeSpec)) {
      return;
    }

    const controller = new AbortController();
    setRefreshing(true);
    fetchPreview(activeSpec, controller.signal)
      .catch((previewError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          previewError instanceof Error
            ? previewError.message
            : "Failed to refresh preview";
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [activeSpec, fetchPreview, generating]);

  const generateFromPrompt = useCallback(
    async (nextPrompt: string, nextSelection?: Selection) => {
      const promptText = nextPrompt.trim();
      if (!promptText) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastRefreshSpec.current = "";

      setGenerating(true);
      setError(null);

      const effectiveSelection = nextSelection ?? selection;
      const effectiveExample =
        effectiveSelection.mode === "example"
          ? (examples.find(
              (item) => item.name === effectiveSelection.exampleName
            ) ?? null)
          : null;

      if (nextSelection) {
        setSelection(nextSelection);
      }

      try {
        const startingSpec = effectiveExample?.spec ?? null;

        const res = await fetch(`${API_BASE}/json-render-image-generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            startingSpec,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const message = await getApiErrorMessage(res, "Generation failed");
          throw new Error(message);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const compiler = createSpecStreamCompiler(
          startingSpec ? { ...startingSpec } : {}
        );
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          const { result, newPatches } = compiler.push(chunk);
          if (newPatches.length > 0) {
            setGeneratedSpec(result as unknown as Spec);
          }
        }

        const finalSpec = compiler.getResult() as unknown as Spec;
        setGeneratedSpec(finalSpec);
        await fetchPreview(finalSpec);
      } catch (generationError: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          generationError instanceof Error
            ? generationError.message
            : "Something went wrong";
        setError(message);
      } finally {
        if (!controller.signal.aborted) {
          setGenerating(false);
        }
      }
    },
    [fetchPreview, selection]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!generating) {
      generateFromPrompt(prompt).catch((generationError: unknown) => {
        const message =
          generationError instanceof Error
            ? generationError.message
            : "Something went wrong";
        setError(message);
      });
      setPrompt("");
    }
  };

  const handlePresetClick = useCallback(
    (exampleName: string) => {
      if (generating) {
        return;
      }

      const example = examples.find((item) => item.name === exampleName);
      if (!example) {
        return;
      }

      const generatedPrompt = `Use the ${example.label} style as a starting point and redesign it. ${example.description}`;
      generateFromPrompt(generatedPrompt, {
        mode: "example",
        exampleName,
      }).catch((generationError: unknown) => {
        const message =
          generationError instanceof Error
            ? generationError.message
            : "Something went wrong";
        setError(message);
      });
    },
    [generateFromPrompt, generating]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setGenerating(false);
  }, []);

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    setSelection({ mode: "scratch" });
    setGeneratedSpec(null);
    setPrompt("");
    setError(null);
    setGenerating(false);

    const previous = previewUrlRef.current;
    previewUrlRef.current = null;
    setPreviewUrl(null);
    if (previous) {
      URL.revokeObjectURL(previous);
    }

    setJustCleared(true);
    if (clearFeedbackTimeoutRef.current) {
      clearTimeout(clearFeedbackTimeoutRef.current);
    }
    clearFeedbackTimeoutRef.current = setTimeout(() => {
      setJustCleared(false);
    }, 900);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!activeSpec) {
      return;
    }

    const width = parseDimensionInput(widthInput, frameSize.width);
    const height = parseDimensionInput(heightInput, frameSize.height);

    try {
      const res = await fetch(`${API_BASE}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: activeSpec,
          format,
          width,
          height,
          theme,
          download: true,
          filename: "generated-image",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to download image");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `generated-image.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError: unknown) {
      const message =
        downloadError instanceof Error
          ? downloadError.message
          : "Failed to download image";
      toast.error(message);
    }
  }, [
    activeSpec,
    format,
    frameSize.height,
    frameSize.width,
    heightInput,
    theme,
    widthInput,
  ]);

  const hasPreview = Boolean(previewUrl);
  const hasSpec = Boolean(activeSpec);
  const showOnboarding = !(hasSpec || generating);
  const showSceneEmptyHint = !(hasSpec || generating);
  const visiblePresets = examples.slice(0, 4);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col p-3 sm:p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-red-800 shadow-sm dark:bg-red-950 dark:text-red-200">
            <p className="font-medium text-sm">Error: {error}</p>
          </div>
        )}

        <div className="rounded-[20px] bg-background p-2 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_8px_20px_-12px_rgba(15,23,42,0.2)]">
          <div className="relative aspect-video min-h-[340px] w-full overflow-hidden rounded-[12px] bg-muted/30 sm:min-h-[420px]">
            {previewUrl ? (
              <div className="flex h-full w-full items-center justify-center p-4 sm:p-6">
                <Image
                  alt="Generated preview"
                  className="max-h-full max-w-full rounded-xl border bg-background object-contain shadow-sm"
                  height={parseDimensionInput(heightInput, frameSize.height)}
                  src={previewUrl}
                  unoptimized
                  width={parseDimensionInput(widthInput, frameSize.width)}
                />
              </div>
            ) : null}

            {showOnboarding && (
              <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-3xl rounded-[20px] bg-background/94 p-2 backdrop-blur-sm">
                  <div className="rounded-[12px] bg-background p-4 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_2px_4px_0px_rgba(15,23,42,0.06)] sm:p-5">
                    <p className="font-medium text-muted-foreground text-xs uppercase tabular-nums">
                      AI Image Builder
                    </p>
                    <h2 className="mt-1 text-balance font-semibold text-foreground text-xl sm:text-2xl">
                      Pick a preset or type an image prompt.
                    </h2>
                    <p className="mt-2 text-pretty text-muted-foreground text-sm">
                      Generate polished social cards, feature graphics, and
                      visual assets as JSON-render specs with instant preview.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {visiblePresets.map((preset) => (
                        <Button
                          className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
                          key={preset.name}
                          onClick={() => handlePresetClick(preset.name)}
                          type="button"
                          variant="outline"
                        >
                          <span className="flex flex-col items-start gap-0.5">
                            <span className="text-sm">{preset.label}</span>
                            <span className="line-clamp-2 max-w-full whitespace-normal break-words text-muted-foreground text-xs">
                              {preset.description}
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(generating || refreshing) && (
              <div className="pointer-events-none absolute top-3 left-3">
                <div className="inline-flex items-center gap-2 rounded-lg bg-background/88 px-2.5 py-1.5 text-foreground text-xs shadow-sm backdrop-blur-sm">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span className="tabular-nums">
                    {generating ? loadingStage : "Refreshing preview"}
                  </span>
                </div>
              </div>
            )}

            <div className="absolute top-3 right-3 flex items-center gap-2 rounded-lg bg-background/88 p-1.5 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-1">
                {(["png", "svg"] as const).map((nextFormat) => (
                  <button
                    className={cn(
                      "rounded-md px-2 py-1 font-mono text-xs transition-colors",
                      format === nextFormat
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                    key={nextFormat}
                    onClick={() => setFormat(nextFormat)}
                    type="button"
                  >
                    {nextFormat}
                  </button>
                ))}
              </div>
              <div className="hidden items-center gap-1 sm:flex">
                <Input
                  className="h-7 w-20 rounded-lg px-2 font-mono text-xs"
                  inputMode="numeric"
                  onChange={(event) => setWidthInput(event.target.value)}
                  value={widthInput}
                />
                <span className="text-muted-foreground text-xs">x</span>
                <Input
                  className="h-7 w-20 rounded-lg px-2 font-mono text-xs"
                  inputMode="numeric"
                  onChange={(event) => setHeightInput(event.target.value)}
                  value={heightInput}
                />
              </div>
              {hasPreview && (
                <Button
                  className="h-7 rounded-lg px-2.5"
                  onClick={handleDownload}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <DownloadIcon className="size-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
              )}
            </div>

            {showSceneEmptyHint && (
              <div className="pointer-events-none absolute right-3 bottom-3 left-3">
                <EmptyState />
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
            disabled={generating}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              selection.mode === "example" && currentExample
                ? `Refine ${currentExample.label.toLowerCase()}...`
                : "Describe the image you want..."
            }
            value={prompt}
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
            disabled={generating ? false : !prompt.trim()}
            onClick={generating ? handleStop : undefined}
            type={generating ? "button" : "submit"}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                initial={{ opacity: 0, scale: 0.9 }}
                key={generating ? "streaming" : "idle"}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {generating ? (
                  <SquareIcon className="size-4" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
              </motion.span>
            </AnimatePresence>
            {generating ? "Stop" : "Generate"}
          </Button>
        </form>
      </div>
    </div>
  );
}
