"use client";

import type { Spec } from "@json-render/core";
import { createSpecStreamCompiler } from "@json-render/core";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  SparklesIcon,
  SquareIcon,
  Undo2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { examples } from "../lib/examples";

const API_BASE = "/view/json-render-pdf/api";

const PDF_REFRESH_INTERVAL_MS = 2000;

type CardTab = "preview" | "json";

const EXAMPLE_PRESETS = [
  { name: "invoice", label: "Invoice", intent: "header + line items + totals" },
  {
    name: "report",
    label: "Quarterly Report",
    intent: "metrics table + key findings",
  },
  {
    name: "resume",
    label: "Resume",
    intent: "experience + skills + contact",
  },
  {
    name: "letter",
    label: "Business Letter",
    intent: "letterhead + body + signature",
  },
] as const;

const LOADING_STAGES = [
  "Preparing document",
  "Building layout",
  "Styling elements",
  "Rendering pages",
];

function isRenderableSpec(spec: Spec | null): spec is Spec {
  if (!(spec?.root && spec.elements)) return false;
  const root = spec.elements[spec.root];
  if (!root) return false;
  if (root.type !== "Document" || !root.children?.length) return false;
  const firstChild = spec.elements[root.children[0]!];
  return firstChild?.type === "Page";
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
  if (text.trim().length > 0) return text;
  if (response.status === 429) {
    return "Rate limit hit. You've reached the generation limit for now. Please try again later.";
  }
  return fallbackMessage;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-lg bg-background/88 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
      onClick={handleClick}
      type="button"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          initial={{ opacity: 0, scale: 0.9 }}
          key={copied ? "check" : "copy"}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {copied ? (
            <CheckIcon className="size-3" />
          ) : (
            <CopyIcon className="size-3" />
          )}
        </motion.span>
      </AnimatePresence>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function JsonRenderPdfDemo() {
  const [selectedExample, setSelectedExample] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<Spec | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CardTab>("preview");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingStage, setLoadingStage] = useState(LOADING_STAGES[0]);
  const [justCleared, setJustCleared] = useState(false);

  const pdfUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const clearFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const currentExample = selectedExample
    ? examples.find((e) => e.name === selectedExample)
    : null;

  const activeSpec = generatedSpec ?? currentExample?.spec ?? null;

  const examplePdfUrl =
    selectedExample && !generatedSpec
      ? `${API_BASE}/pdf?name=${selectedExample}#navpanes=0`
      : null;

  const displayPdfUrl = pdfUrl ?? examplePdfUrl;
  const hasContent = Boolean(activeSpec || displayPdfUrl);
  const showOnboarding = !(hasContent || generating);

  useEffect(() => {
    if (!generating) return;
    codeScrollRef.current?.scrollTo({
      top: codeScrollRef.current.scrollHeight,
    });
  }, [generating, generatedSpec]);

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
      if (clearFeedbackTimeoutRef.current) {
        clearTimeout(clearFeedbackTimeoutRef.current);
      }
    },
    []
  );

  const fetchPdfBlob = useCallback(async (spec: Spec, signal?: AbortSignal) => {
    const res = await fetch(`${API_BASE}/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
      signal,
    });
    if (!res.ok) throw new Error("Failed to generate PDF");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const viewUrl = `${url}#navpanes=0`;
    const prev = pdfUrlRef.current;
    pdfUrlRef.current = url;
    setPdfUrl(viewUrl);
    if (prev) URL.revokeObjectURL(prev);
  }, []);

  const lastRefreshSpec = useRef("");
  const generatedSpecRef = useRef<Spec | null>(null);
  generatedSpecRef.current = generatedSpec;

  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => {
      const spec = generatedSpecRef.current;
      if (!spec) return;
      const specKey = JSON.stringify(spec);
      if (specKey === lastRefreshSpec.current) return;
      if (!isRenderableSpec(spec)) return;
      lastRefreshSpec.current = specKey;
      setRefreshing(true);
      fetchPdfBlob(spec)
        .catch(() => {})
        .finally(() => setRefreshing(false));
    }, PDF_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [generating, fetchPdfBlob]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setError(null);
    setActiveTab("preview");
    lastRefreshSpec.current = "";

    try {
      const startingSpec = currentExample ? currentExample.spec : null;

      const res = await fetch(`${API_BASE}/json-render-pdf-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          startingSpec,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const message = await getApiErrorMessage(res, "Generation failed");
        throw new Error(message);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      const compiler = createSpecStreamCompiler(
        startingSpec ? { ...startingSpec } : {}
      );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const { result, newPatches } = compiler.push(chunk);
        if (newPatches.length > 0) setGeneratedSpec(result as unknown as Spec);
      }

      const finalSpec = compiler.getResult() as unknown as Spec;
      setGeneratedSpec(finalSpec);
      setGenerating(false);
      await fetchPdfBlob(finalSpec);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Something went wrong");
      setGenerating(false);
    }
  }, [prompt, generating, currentExample, fetchPdfBlob]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setGenerating(false);
    if (generatedSpec && isRenderableSpec(generatedSpec)) {
      fetchPdfBlob(generatedSpec).catch(() => {});
    }
  }, [generatedSpec, fetchPdfBlob]);

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    setSelectedExample(null);
    setGeneratedSpec(null);
    setPdfUrl(null);
    setError(null);
    setPrompt("");
    setGenerating(false);
    setActiveTab("preview");
    setJustCleared(true);
    if (clearFeedbackTimeoutRef.current) {
      clearTimeout(clearFeedbackTimeoutRef.current);
    }
    clearFeedbackTimeoutRef.current = setTimeout(() => {
      setJustCleared(false);
    }, 900);
  }, []);

  const handlePresetClick = (presetName: string) => {
    if (generating) return;
    abortRef.current?.abort();
    setSelectedExample(presetName);
    setGeneratedSpec(null);
    setPdfUrl(null);
    setError(null);
    setPrompt("");
    setGenerating(false);
    setActiveTab("preview");
  };

  const handleDownload = async () => {
    if (!activeSpec) return;
    if (generatedSpec) {
      const res = await fetch(`${API_BASE}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: generatedSpec, download: true }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } else if (selectedExample) {
      window.open(
        `${API_BASE}/pdf?name=${selectedExample}&download=1`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGenerate();
  };

  const jsonCode = activeSpec
    ? JSON.stringify(activeSpec, null, 2)
    : "// select an example or generate a PDF";

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col p-3 sm:p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-red-800 shadow-sm dark:bg-red-950 dark:text-red-200">
            <p className="font-medium text-sm">Error: {error}</p>
          </div>
        )}

        <div className="min-h-0 flex-1 rounded-[20px] bg-background p-2 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_8px_20px_-12px_rgba(15,23,42,0.2)]">
          <div className="relative h-full w-full overflow-hidden rounded-[12px] bg-muted/30">
            {hasContent && (
              <div className="pointer-events-none absolute top-3 right-3 left-3 z-10 flex items-center justify-end">
                <div className="pointer-events-auto flex items-center gap-1.5">
                  {(["preview", "json"] as const).map((tab) => (
                    <button
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 font-mono text-xs backdrop-blur-sm transition-colors",
                        activeTab === tab
                          ? "bg-background/88 font-medium text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                      )}
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      type="button"
                    >
                      {tab}
                    </button>
                  ))}
                  {activeTab === "json" && activeSpec && (
                    <CopyButton text={jsonCode} />
                  )}
                  {activeSpec && (
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg bg-background/88 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
                      onClick={handleDownload}
                      type="button"
                    >
                      <DownloadIcon className="size-3" />
                      Download
                    </button>
                  )}
                </div>
              </div>
            )}

            {generating && (
              <div className="pointer-events-none absolute top-3 left-3 z-10">
                <div className="inline-flex items-center gap-2 rounded-lg bg-background/88 px-2.5 py-1.5 text-foreground text-xs shadow-sm backdrop-blur-sm">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span className="tabular-nums">{loadingStage}</span>
                  {refreshing && (
                    <span className="text-muted-foreground">&middot; PDF</span>
                  )}
                </div>
              </div>
            )}

            {activeTab === "preview" ? (
              displayPdfUrl ? (
                <iframe
                  className="h-full w-full border-0"
                  src={displayPdfUrl}
                  style={{ minHeight: "100%" }}
                  title="PDF preview"
                />
              ) : showOnboarding ? null : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-pretty text-center text-muted-foreground text-sm">
                    PDF preview will appear here during generation.
                  </p>
                </div>
              )
            ) : (
              <div className="h-full overflow-auto" ref={codeScrollRef}>
                <pre className="p-4 pt-12 font-mono text-xs">
                  <code>{jsonCode}</code>
                </pre>
              </div>
            )}

            {showOnboarding && (
              <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-3xl rounded-[20px] bg-background/94 p-2 backdrop-blur-sm">
                  <div className="rounded-[12px] bg-background p-4 shadow-[0px_0px_0px_1px_rgba(15,23,42,0.06),0px_1px_2px_-1px_rgba(15,23,42,0.08),0px_2px_4px_0px_rgba(15,23,42,0.06)] sm:p-5">
                    <p className="font-medium text-muted-foreground text-xs uppercase tabular-nums">
                      AI PDF Builder
                    </p>
                    <h2 className="mt-1 text-balance font-semibold text-foreground text-xl sm:text-2xl">
                      Pick an example or describe a document.
                    </h2>
                    <p className="mt-2 text-pretty text-muted-foreground text-sm">
                      Generate invoices, reports, resumes, and letters from
                      natural language. Start from an example or describe what
                      you need.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {EXAMPLE_PRESETS.map((preset) => (
                        <Button
                          className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
                          key={preset.name}
                          onClick={() => handlePresetClick(preset.name)}
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

            {showOnboarding && (
              <div className="pointer-events-none absolute right-3 bottom-3 left-3">
                <p className="rounded-lg bg-background/78 px-2.5 py-1.5 text-center text-muted-foreground text-xs backdrop-blur-sm">
                  Or type a prompt below to generate a PDF from scratch.
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
            disabled={generating}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              currentExample
                ? `Modify the ${currentExample.label.toLowerCase()}...`
                : "Describe the PDF you want..."
            }
            value={prompt}
          />
          {hasContent && !generating && (
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
          {generating ? (
            <Button
              className="h-11 rounded-xl pr-3.5 pl-3"
              onClick={handleStop}
              type="button"
              variant="outline"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  key="stop"
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <SquareIcon className="size-4" />
                </motion.span>
              </AnimatePresence>
              Stop
            </Button>
          ) : (
            <Button
              className="h-11 rounded-xl pr-3.5 pl-3"
              disabled={!prompt.trim()}
              type="submit"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  key="generate"
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <SparklesIcon className="size-4" />
                </motion.span>
              </AnimatePresence>
              Generate
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
