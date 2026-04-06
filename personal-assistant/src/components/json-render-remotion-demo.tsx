"use client";

import { createSpecStreamCompiler } from "@json-render/core";
import type { TimelineSpec } from "@json-render/remotion";
import { Renderer } from "@json-render/remotion";
import { Player, type PlayerRef } from "@remotion/player";
import {
  CheckIcon,
  Download,
  Loader2Icon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { SVGProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { customComponents } from "../lib/custom-components";
import { RemotionThemeProvider } from "../lib/remotion-theme-context";

function RemotionLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 250 250">
      <title>Remotion</title>
      <path
        d="M81.0309 33.9631C77.1822 34.1706 74.0808 34.777 70.9553 35.9581C69.3966 36.5407 66.8415 37.8095 65.4355 38.6874C59.554 42.3503 55.0706 47.8566 52.7325 54.2647C52.2665 55.5335 51.0051 59.5795 50.1936 62.3646C44.7862 80.9823 41.7169 101.34 41.0581 122.886C40.9536 126.318 40.9536 134.489 41.0581 137.865C41.5 152.15 42.8739 165.046 45.3647 178.197C46.3771 183.52 48.0001 190.67 48.9401 193.918C50.8604 200.517 54.7814 206.135 60.3575 210.253C64.0937 213.014 68.336 214.866 73.0363 215.776C75.3021 216.214 78.291 216.414 80.4925 216.27C83.5377 216.071 89.5798 215.265 94.489 214.395C116.617 210.477 137.057 203.462 155.593 193.423C167.332 187.063 177.367 180.176 187.049 171.821C196.699 163.505 204.926 154.56 212.166 144.521C213.845 142.198 214.689 140.842 215.532 139.134C217.702 134.729 218.722 130.348 218.714 125.448C218.714 120.883 217.846 116.829 215.974 112.68C215.074 110.677 214.215 109.24 212.286 106.511C205.184 96.4639 197.301 87.7096 187.692 79.2027C172.796 66.0195 155.103 55.2063 135.346 47.2022C131.063 45.4705 126.845 43.9463 121.767 42.2944C111.016 38.8071 97.711 35.7826 86.4543 34.2743C84.6867 34.0349 82.2843 33.8992 81.0309 33.9631Z"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <path
        d="M91.4565 53.3788C88.428 53.5421 85.9875 54.0193 83.528 54.9487C82.3015 55.4071 80.2909 56.4056 79.1844 57.0964C74.5563 59.9787 71.0284 64.3116 69.1885 69.3542C68.8218 70.3526 67.8291 73.5364 67.1906 75.728C62.9355 90.3783 60.5203 106.398 60.0018 123.353C59.9196 126.053 59.9196 132.483 60.0018 135.139C60.3496 146.38 61.4307 156.528 63.3907 166.877C64.1874 171.065 65.4645 176.692 66.2042 179.248C67.7153 184.441 70.8007 188.862 75.1886 192.102C78.1286 194.275 81.4669 195.732 85.1656 196.447C86.9485 196.793 89.3005 196.95 91.0329 196.837C93.4291 196.68 98.1837 196.046 102.047 195.361C119.459 192.278 135.544 186.758 150.13 178.858C159.367 173.853 167.264 168.434 174.882 161.859C182.476 155.316 188.95 148.276 194.647 140.377C195.968 138.549 196.632 137.482 197.296 136.138C199.003 132.672 199.806 129.224 199.8 125.368C199.8 121.776 199.117 118.586 197.644 115.321C196.936 113.745 196.259 112.614 194.742 110.467C189.152 102.561 182.95 95.6721 175.388 88.978C163.666 78.6041 149.744 70.0952 134.197 63.7967C130.827 62.434 128.173 61.2346 125.299 59.9347C115.052 57.1905 104.582 54.8106 95.7242 53.6237C94.3333 53.4353 92.4428 53.3286 91.4565 53.3788Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M102.247 73.5165C100.069 73.6339 98.314 73.9771 96.5452 74.6455C95.6632 74.9751 94.2173 75.6932 93.4216 76.1899C90.0933 78.2628 87.5562 81.3787 86.2331 85.005C85.9694 85.7231 85.2555 88.0126 84.7963 89.5887C81.7363 100.124 79.9994 111.644 79.6266 123.838C79.5675 125.779 79.5675 130.404 79.6266 132.314C79.8767 140.397 80.6542 147.695 82.0637 155.137C82.6366 158.15 83.555 162.196 84.087 164.034C85.1737 167.768 87.3925 170.948 90.548 173.278C92.6623 174.84 95.063 175.888 97.7229 176.403C99.0051 176.651 100.696 176.764 101.942 176.683C103.666 176.57 107.085 176.114 109.863 175.622C122.385 173.404 133.952 169.435 144.441 163.754C151.084 160.155 156.763 156.257 162.242 151.529C167.703 146.824 172.359 141.761 176.455 136.08C177.406 134.766 177.883 133.998 178.36 133.032C179.588 130.539 180.165 128.06 180.161 125.287C180.161 122.704 179.67 120.41 178.61 118.062C178.101 116.928 177.615 116.115 176.523 114.571C172.504 108.885 168.044 103.931 162.606 99.1173C154.176 91.657 144.164 85.5379 132.983 81.0084C130.56 80.0285 128.173 79.1659 125.299 78.2311C119.216 76.2577 111.686 74.5461 105.316 73.6926C104.316 73.5571 102.956 73.4804 102.247 73.5165Z"
        fill="currentColor"
      />
    </svg>
  );
}

const API_BASE = "/view/json-render-remotion/api";
const RATE_LIMIT_ERROR_MESSAGE =
  "Rate limit hit. You've reached the generation limit for now. Please try again later.";

type VideoPreset = {
  label: string;
  prompt: string;
  intent: string;
};

const VIDEO_PRESETS: VideoPreset[] = [
  {
    label: "Feature Launch",
    intent: "headline + steps + metrics + CTA",
    prompt:
      "Create a 30-second feature launch video for json-render. Add a GradientBackground on the backdrop track with colors ['#3b82f6', '#60a5fa', '#1e3a8a'] direction 'diagonal' speed 0.5. Open with AnimatedHeadline text 'New - JSON render remotion' mode 'word' gradientColors '#1e3a8a, #3b82f6, #60a5fa' subtitle 'No AI video APIs. Just specs + Remotion.'. Show an InputDemo with label 'Describe your video' icon 'search' typedText 'A product launch...' accentColor '#3b82f6'. Show a StepByStep with 4 steps: { title: 'Describe it', description: 'Type what you want in plain language' }, { title: 'AI streams the spec', description: 'JSON timeline — clips, transitions, components' }, { title: 'Remotion renders it', description: 'React components you own and control' }, { title: 'Post to socials', description: 'Make that money baby' }. Show a ComparisonTable: left { label: 'AI video APIs', items: ['Pay per rendered second', 'Black-box output', 'No component access', 'Vendor lock-in'] }, right { label: 'json-render + Remotion', items: ['Zero per-frame cost', 'Full source control', 'React components', 'Your infrastructure'] }, highlightSide 'right'. Show a MetricGrid with 3 metrics: { value: '0', suffix: '¢', label: 'Per-frame AI cost' }, { value: '100', suffix: '%', label: 'Component control' }, { value: '1', suffix: ' prompt', label: 'To full video' }. End with CallToAction headline 'Try free at aisdkagents.com' subtitle 'One prompt. Full video.' buttonText 'Get started' accentColor '#3b82f6'. Use crossfade transitions.",
  },
  {
    label: "Customer Social Proof",
    intent: "testimonial + badges + metrics",
    prompt:
      "Make a 23-second customer testimonial video. Open with an AnimatedHeadline text 'Loved by Developers' mode 'word' gradientColors '#a78bfa, #818cf8'. Show a TestimonialCard with quote 'aisdkagents.com cut our deploy time from 20 minutes to 30 seconds. It just works.' name 'Sarah Chen' title 'CTO' company 'Launchpad' rating 5. Then a BadgeWall titled 'Trusted by' with items: { label: 'Stripe' }, { label: 'Vercel' }, { label: 'Linear' }, { label: 'Notion' }, { label: 'Netlify' }. Then an InputDemo with label 'Try it free' icon 'search' typedText 'aisdkagents.com' showSubmitButton true. Follow with a MetricGrid with 3 metrics: { value: '4.9', suffix: '/5', label: 'Rating' }, { value: '2400', suffix: '+', label: 'Teams' }, { value: '98', suffix: '%', label: 'Recommend' }. End with CallToAction headline 'Join them' buttonText 'Start free trial'. Use crossfade transitions.",
  },
  {
    label: "Pricing Announcement",
    intent: "pricing card + screen mockup + CTA",
    prompt:
      "Create a 20-second pricing announcement video. Open with TitleCard 'New Pricing — Simpler, More Powerful' on a dark background. Show a PricingCard with planName 'Pro', price '49', period '/mo', features ['Unlimited deploys', '10 team members', 'Custom domains', 'Priority support', 'Analytics dashboard'], highlighted true. Add a Divider with label 'See it in action'. Show an InputDemo with label 'Start free trial' icon 'mail' typedText 'you@company.com' showSubmitButton true. Follow with a ScreenMockup in browser variant with url 'app.aisdkagents.com/dashboard' and metrics: { value: '12.4', suffix: 'k', label: 'Active Users' }, { value: '99.98', suffix: '%', label: 'Uptime' }, { value: '24', suffix: 'ms', label: 'Avg Response' }, { value: '1.2', suffix: 'M', label: 'Requests Today' }. End with CallToAction headline 'Upgrade today' subtitle 'Lock in early pricing' buttonText 'Start free trial'. Use crossfade transitions.",
  },
  {
    label: "How It Works",
    intent: "steps + bar chart + deploy flow",
    prompt:
      "Create a 22-second 'how it works' video. Open with an AnimatedHeadline text 'Deploy in 3 Steps' mode 'word' gradientColors '#a78bfa, #f472b6, #fb923c'. Show an InputDemo with label 'Repository URL' icon 'key' typedText 'github.com/username/my-app' showSubmitButton true. Follow with a StepByStep with steps: { title: 'Connect your repo', description: 'Link your GitHub, GitLab, or Bitbucket repository' }, { title: 'Configure your build', description: 'Auto-detected frameworks — zero config for Next.js, Vite, Remix' }, { title: 'Push to deploy', description: 'Every git push triggers a production build in under 30 seconds' }. Then a BarChart with title 'Build Times (seconds)' and bars: { label: 'Next.js', value: 12 }, { label: 'Vite', value: 8 }, { label: 'Remix', value: 15 }, { label: 'Astro', value: 6 }. End with CallToAction headline 'Start shipping' buttonText 'aisdkagents.com/start'. Use crossfade transitions.",
  },
];

const LOADING_STAGES = [
  "Planning timeline",
  "Placing clips",
  "Applying transitions",
  "Adding effects",
  "Tuning composition",
];

function isSpecComplete(spec: TimelineSpec | null): spec is TimelineSpec & {
  composition: NonNullable<TimelineSpec["composition"]>;
  tracks: NonNullable<TimelineSpec["tracks"]>;
  clips: NonNullable<TimelineSpec["clips"]>;
} {
  return !!(
    spec?.composition &&
    spec.tracks &&
    Array.isArray(spec.clips) &&
    spec.clips.length > 0
  );
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

export function JsonRenderRemotionDemo() {
  const { theme } = useTheme();
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [spec, setSpec] = useState<TimelineSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(LOADING_STAGES[0]);
  const [justCleared, setJustCleared] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clearFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const generate = useCallback(
    async (promptOverride?: string) => {
      const promptToUse = (promptOverride ?? input).trim();
      if (!promptToUse || isGenerating) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGenerating(true);
      setError(null);
      setSpec(null);

      try {
        const response = await fetch(`${API_BASE}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: promptToUse }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await getApiErrorMessage(
            response,
            "Generation failed"
          );
          throw new Error(message);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        const compiler = createSpecStreamCompiler<TimelineSpec>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const { result, newPatches } = compiler.push(chunk);

          if (newPatches.length > 0) {
            setSpec(result);
          }
        }

        const finalSpec = compiler.getResult();
        setSpec(finalSpec);

        if (isSpecComplete(finalSpec)) {
          setTimeout(() => {
            playerRef.current?.play();
          }, 100);
        } else {
          setError("Generated timeline is incomplete");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setIsGenerating(false);
      }
    },
    [input, isGenerating]
  );

  useEffect(() => {
    if (!isGenerating) {
      setLoadingStage(LOADING_STAGES[0]);
      return;
    }

    let stageIndex = 0;
    const interval = setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, LOADING_STAGES.length - 1);
      setLoadingStage(LOADING_STAGES[stageIndex]);
    }, 1200);

    return () => clearInterval(interval);
  }, [isGenerating]);

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
    if (text && !isGenerating) {
      generate(text);
      setInput("");
    }
  };

  const handlePresetClick = (preset: VideoPreset) => {
    if (!isGenerating) {
      generate(preset.prompt);
    }
  };

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setSpec(null);
    setError(null);
    setInput("");
    setJustCleared(true);
    if (clearFeedbackTimeoutRef.current) {
      clearTimeout(clearFeedbackTimeoutRef.current);
    }
    clearFeedbackTimeoutRef.current = setTimeout(() => {
      setJustCleared(false);
    }, 900);
  }, []);

  const handleExport = useCallback(() => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timeline.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [spec]);

  const hasSpec = Boolean(spec);
  const showOnboarding = !(hasSpec || isGenerating);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col p-3 sm:p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-red-800 shadow-sm dark:bg-red-950 dark:text-red-200">
            <p className="font-medium text-sm">Error: {error}</p>
          </div>
        )}

        <div className="rounded-[20px] bg-background p-2 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_8px_20px_-12px_rgba(15,23,42,0.2)]">
          <div className="relative aspect-video min-h-[340px] w-full overflow-hidden rounded-[12px] sm:min-h-[420px]">
            {spec && isSpecComplete(spec) && (
              <RemotionThemeProvider theme={theme}>
                <Player
                  autoPlay
                  component={Renderer}
                  compositionHeight={spec.composition.height}
                  compositionWidth={spec.composition.width}
                  controls
                  durationInFrames={spec.composition.durationInFrames}
                  fps={spec.composition.fps}
                  inputProps={{ spec, components: customComponents }}
                  loop
                  ref={playerRef}
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                />
              </RemotionThemeProvider>
            )}

            {showOnboarding && (
              <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-3xl rounded-[20px] bg-background/94 p-2 backdrop-blur-sm">
                  <div className="rounded-[20px] bg-background p-4 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_2px_4px_0px_rgba(15,23,42,0.06)] sm:p-5">
                    <p className="font-medium text-muted-foreground text-xs uppercase tabular-nums">
                      AI Video Builder
                    </p>
                    <h2 className="mt-1 text-balance font-semibold text-foreground text-xl sm:text-2xl">
                      Pick a preset or type a video prompt.
                    </h2>
                    <p className="mt-2 text-pretty text-muted-foreground text-sm">
                      Generate Remotion video timelines from natural language.
                      Watch the JSON stream in and render live.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {VIDEO_PRESETS.map((preset) => (
                        <Button
                          className="h-auto cursor-pointer justify-start rounded-xl px-3 py-2.5 text-left"
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

            {isGenerating && (
              <div className="pointer-events-none absolute top-3 left-3">
                <div className="inline-flex items-center gap-2 rounded-lg bg-muted/88 px-2.5 py-1.5 text-foreground text-xs shadow-sm backdrop-blur-sm">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span className="tabular-nums">{loadingStage}</span>
                </div>
              </div>
            )}

            {!(hasSpec || isGenerating) && (
              <div className="pointer-events-none absolute right-3 bottom-3 left-3">
                <p className="rounded-lg bg-background/78 px-2.5 py-1.5 text-center text-muted-foreground text-xs backdrop-blur-sm">
                  Video starts empty by design. Choose a preset or describe a
                  video below.
                </p>
              </div>
            )}
          </div>
        </div>

        <form
          className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
          onSubmit={handleSubmit}
        >
          <Input
            className="h-11 rounded-xl"
            disabled={isGenerating}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the video you want..."
            value={input}
          />
          {hasSpec && isSpecComplete(spec) && (
            <Button
              className="h-11 rounded-xl pr-3.5 pl-3"
              onClick={handleExport}
              title="Export timeline JSON"
              type="button"
              variant="outline"
            >
              <Download className="size-4" />
              Export
            </Button>
          )}
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
            disabled={!input.trim() || isGenerating}
            type="submit"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                initial={{ opacity: 0, scale: 0.9 }}
                key={isGenerating ? "streaming" : "idle"}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {isGenerating ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
              </motion.span>
            </AnimatePresence>
            {isGenerating ? "Generating" : "Generate"}
          </Button>
        </form>
      </div>
    </div>
  );
}
