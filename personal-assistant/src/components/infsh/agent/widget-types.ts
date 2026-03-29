export const WidgetTypeUI = 'ui';
export const WidgetTypeHTML = 'html';

// Widget action
export interface WidgetAction {
  type: string;
  payload?: Record<string, unknown>;
  handler?: 'server' | 'client';
  loadingBehavior?: 'auto' | 'self' | 'container' | 'none';
}

// Widget form data
export interface WidgetFormData {
  [key: string]: string | boolean | undefined;
}

// Widget node (tree structure)
export interface WidgetNode {
  type: string;
  value?: string;
  variant?: string;
  size?: string;
  weight?: string;
  color?: string;
  fieldName?: string;
  src?: string;
  alt?: string;
  height?: number | string;
  width?: number | string;
  label?: string;
  iconName?: string;
  action?: WidgetAction;
  onClickAction?: WidgetAction;
  disabled?: boolean;
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  rows?: number;
  options?: { value: string; label: string }[];
  defaultChecked?: boolean;
  children?: WidgetNode[];
  gap?: number;
  align?: string;
  justify?: string;
  direction?: string;
  padding?: number;
  background?: string | { light?: string; dark?: string };
  radius?: string;
  minHeight?: number | string;
  maxHeight?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  aspectRatio?: string;
  minSize?: number;
  spacing?: number;
  onSubmitAction?: WidgetAction;
  asForm?: boolean;
  confirmAction?: WidgetAction;
}

// Widget structure
export interface Widget {
  type: string;
  title?: string;
  html?: string;
  content?: string;
  children?: WidgetNode[];
  actions?: { label: string; variant?: string; action: WidgetAction }[];
  [key: string]: unknown;
}

// Valid widget types - "ui" (interactive) and "html" (static)
// Also accept "card" for backwards compatibility (legacy data)
const VALID_WIDGET_TYPES = [WidgetTypeUI, "card"];

// Helper to parse widget JSON from tool result or Widget object
export function parseWidget(input: string | Widget | unknown): Widget | null {
  // If it's already a Widget object
  if (input && typeof input === "object") {
    const widget = input as Widget;
    if (VALID_WIDGET_TYPES.includes(widget.type)) {
      // Normalize "card" to "ui" for consistency
      if (widget.type === "card") {
        widget.type = WidgetTypeUI;
      }
      return widget;
    }
    return null;
  }

  // If it's a JSON string
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed?.type && VALID_WIDGET_TYPES.includes(parsed.type)) {
        // Normalize "card" to "ui" for consistency
        if (parsed.type === "card") {
          parsed.type = WidgetTypeUI;
        }
        return parsed as Widget;
      }
      return null;
    } catch {
      return null;
    }
  }

  return null;
}
