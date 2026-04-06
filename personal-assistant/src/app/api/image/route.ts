import type { Spec } from "@json-render/core";
import { renderToSvg } from "@json-render/image/render";

import { examples } from "../../../lib/examples";
import { loadSatoriFonts } from "../../../lib/fonts";

type RenderFormat = "svg" | "png";
type ThemeMode = "light" | "dark";

type RenderInput = {
  spec: Spec;
  format: RenderFormat;
  filename?: string;
  download?: boolean;
  width?: number;
  height?: number;
  theme?: ThemeMode;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? examples[0]?.name ?? "image";
  const format = parseFormat(searchParams.get("format"));
  const download = searchParams.get("download") === "1";
  const width = parseDimension(searchParams.get("width"));
  const height = parseDimension(searchParams.get("height"));
  const theme = parseTheme(searchParams.get("theme"));

  if (!format) {
    return new Response("Invalid format", { status: 400 });
  }

  const example = examples.find((item) => item.name === name);
  if (!example) {
    return new Response("Example not found", { status: 404 });
  }

  return imageResponse({
    spec: example.spec,
    format,
    filename: name,
    download,
    width,
    height,
    theme,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as RenderInput;
  const { spec, filename, download, width, height, theme } = body;
  const format = parseFormat(body.format);

  if (!(spec && isRenderableSpec(spec))) {
    return new Response("Invalid spec", { status: 400 });
  }
  if (!format) {
    return new Response("Invalid format", { status: 400 });
  }

  return imageResponse({
    spec,
    format,
    filename: filename ?? "image",
    download: download ?? false,
    width,
    height,
    theme,
  });
}

function parseFormat(value: string | null | undefined): RenderFormat | null {
  if (value === "svg" || value === "png") {
    return value;
  }
  return null;
}

function parseDimension(value: string | null): number | undefined {
  if (!value) {
    return;
  }
  const parsed = Number(value);
  if (!(Number.isFinite(parsed) && parsed > 0)) {
    return;
  }
  return Math.round(parsed);
}

function parseTheme(value: string | null | undefined): ThemeMode {
  return value === "light" ? "light" : "dark";
}

function isRenderableSpec(spec: Spec): boolean {
  if (!(spec.root && spec.elements)) {
    return false;
  }
  return spec.elements[spec.root] !== undefined;
}

async function imageResponse({
  spec,
  format,
  filename,
  download,
  width,
  height,
  theme = "dark",
}: RenderInput): Promise<Response> {
  const themedSpec = resolveSpecTheme(spec, theme);
  const fonts = await loadSatoriFonts();
  const disposition = download
    ? `attachment; filename="${filename}.${format}"`
    : `inline; filename="${filename}.${format}"`;

  if (format === "svg") {
    const svg = await renderToSvg(themedSpec, { fonts, width, height });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  }

  const png = await renderPngWithResvg(themedSpec, { fonts, width, height });
  return new Response(png as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}

const THEME_TOKEN_MAP: Record<ThemeMode, Record<string, string>> = {
  light: {
    "--background": "#ffffff",
    "--foreground": "#171717",
    "--card": "#ffffff",
    "--card-foreground": "#171717",
    "--popover": "#ffffff",
    "--popover-foreground": "#171717",
    "--primary": "#2563eb",
    "--primary-foreground": "#ffffff",
    "--secondary": "#f5f5f5",
    "--secondary-foreground": "#262626",
    "--muted": "#f5f5f5",
    "--muted-foreground": "#737373",
    "--accent": "#f5f5f5",
    "--accent-foreground": "#262626",
    "--border": "#e5e5e5",
    "--input": "#e5e5e5",
    "--ring": "#a3a3a3",
    "--surface": "#fafafa",
    "--surface-foreground": "#171717",
  },
  dark: {
    "--background": "#171717",
    "--foreground": "#fafafa",
    "--card": "#262626",
    "--card-foreground": "#fafafa",
    "--popover": "#262626",
    "--popover-foreground": "#fafafa",
    "--primary": "#2563eb",
    "--primary-foreground": "#ffffff",
    "--secondary": "#3f3f46",
    "--secondary-foreground": "#fafafa",
    "--muted": "#3f3f46",
    "--muted-foreground": "#a3a3a3",
    "--accent": "#3f3f46",
    "--accent-foreground": "#fafafa",
    "--border": "#404040",
    "--input": "#525252",
    "--ring": "#737373",
    "--surface": "#333333",
    "--surface-foreground": "#a3a3a3",
  },
};

function resolveSpecTheme(spec: Spec, theme: ThemeMode): Spec {
  const palette = THEME_TOKEN_MAP[theme];
  return resolveThemeTokens(spec, palette);
}

function resolveThemeTokens<T>(value: T, palette: Record<string, string>): T {
  if (typeof value === "string") {
    const match = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
    if (match) {
      const token = match[1];
      const resolved = palette[token];
      if (resolved) {
        return resolved as T;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveThemeTokens(item, palette)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => [key, resolveThemeTokens(item, palette)]
    );
    return Object.fromEntries(entries) as T;
  }

  return value;
}

async function renderPngWithResvg(
  spec: Spec,
  options: {
    fonts: Awaited<ReturnType<typeof loadSatoriFonts>>;
    width?: number;
    height?: number;
  }
): Promise<Uint8Array> {
  const svg = await renderToSvg(spec, options);

  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg);
    return resvg.render().asPng();
  } catch {
    throw new Error(
      "PNG renderer unavailable. Ensure @resvg/resvg-js is installed and restart the dev server."
    );
  }
}
