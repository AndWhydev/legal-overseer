"use client"

import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Widget, WidgetAction, WidgetFormData, WidgetNode } from "@/components/infsh/agent/widget-types"
import { cn } from "@/lib/utils"
import React, { createContext, useContext, useState } from "react"

// Use the shared form data type
type FormData = WidgetFormData

// Local variant types (shadcn doesn't export the Props types)
type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link"
type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

const toButtonVariant = (v?: string): ButtonVariant => {
  if (v === "default" || v === "secondary" || v === "outline" || v === "ghost" || v === "destructive" || v === "link") {
    return v
  }
  return "default"
}

const toBadgeVariant = (v?: string): BadgeVariant => {
  if (v === "default" || v === "secondary" || v === "outline" || v === "destructive") {
    return v
  }
  return "default"
}

// Context for handling widget actions
type WidgetContextValue = {
  onAction: (action: WidgetAction, formData?: FormData) => void
  formData: FormData
  setFormValue: (name: string, value: string | boolean) => void
  isDisabled: boolean
  loadingActionType: string | null
}

const WidgetContext = createContext<WidgetContextValue | null>(null)

const useWidgetContext = () => {
  const ctx = useContext(WidgetContext)
  if (!ctx) throw new Error("useWidgetContext must be used within WidgetRenderer")
  return ctx
}

// Helper to map text variant to CSS classes
const toTextClasses = (variant?: string): string => {
  switch (variant) {
    case "muted":
      return "text-xs text-muted-foreground"
    case "bold":
      return "text-sm font-medium"
    case "title":
      return "text-sm font-medium"
    case "small":
      return "text-xs"
    default:
      return "text-sm"
  }
}

// Helper to map size to font size classes
const toSizeClasses = (size?: string): string => {
  switch (size) {
    case "xs": return "text-xs"
    case "sm": return "text-sm"
    case "md": return "text-base"
    case "lg": return "text-lg"
    case "xl": return "text-xl"
    case "2xl": return "text-2xl"
    case "3xl": return "text-3xl"
    default: return "text-sm"
  }
}

// Helper to map weight to font weight classes
const toWeightClasses = (weight?: string): string => {
  switch (weight) {
    case "normal": return "font-normal"
    case "medium": return "font-medium"
    case "semibold": return "font-semibold"
    case "bold": return "font-bold"
    default: return ""
  }
}

// Helper to map align to flex classes
const toAlignClasses = (align?: string): string => {
  switch (align) {
    case "start": return "items-start"
    case "center": return "items-center"
    case "end": return "items-end"
    case "baseline": return "items-baseline"
    case "stretch": return "items-stretch"
    default: return ""
  }
}

// Helper to map justify to flex classes
const toJustifyClasses = (justify?: string): string => {
  switch (justify) {
    case "start": return "justify-start"
    case "center": return "justify-center"
    case "end": return "justify-end"
    case "between": return "justify-between"
    case "around": return "justify-around"
    case "evenly": return "justify-evenly"
    default: return ""
  }
}

// Helper to map radius to border radius classes
const toRadiusClasses = (radius?: string): string => {
  switch (radius) {
    case "none": return "rounded-none"
    case "sm": return "rounded-sm"
    case "md": return "rounded-md"
    case "lg": return "rounded-lg"
    case "xl": return "rounded-xl"
    case "2xl": return "rounded-2xl"
    case "full": return "rounded-full"
    default: return "rounded-md"
  }
}

// Helper to map background to CSS classes or inline styles
type BackgroundResult = { className?: string; style?: React.CSSProperties }

const toBackgroundStyles = (background?: string | { light?: string; dark?: string }): BackgroundResult => {
  if (!background) return {}

  if (typeof background === "object") {
    const value = background.dark || background.light
    if (!value) return {}
    return toBackgroundStyles(value)
  }

  // Semantic tokens
  switch (background) {
    case "surface-secondary":
      return { className: "bg-muted" }
    case "surface-tertiary":
      return { className: "bg-muted/50" }

    // Preset gradients
    case "gradient-blue":
      return { className: "bg-gradient-to-br from-blue-500/60 to-indigo-500/60" }
    case "gradient-purple":
      return { className: "bg-gradient-to-br from-purple-500/60 to-pink-500/60" }
    case "gradient-warm":
      return { className: "bg-gradient-to-br from-orange-500/60 to-red-500/60" }
    case "gradient-cool":
      return { className: "bg-gradient-to-br from-cyan-500/60 to-emerald-500/60" }
    case "gradient-sunset":
      return { className: "bg-gradient-to-br from-rose-500/60 to-orange-500/60" }
    case "gradient-ocean":
      return { className: "bg-gradient-to-br from-blue-600/60 to-teal-500/60" }
    case "gradient-forest":
      return { className: "bg-gradient-to-br from-green-600/60 to-teal-600/60" }
    case "gradient-midnight":
      return { className: "bg-gradient-to-br from-slate-700/60 to-purple-900/60" }

    // Alpha tokens
    case "alpha-5":
      return { style: { background: "rgba(255, 255, 255, 0.05)" } }
    case "alpha-10":
      return { style: { background: "rgba(255, 255, 255, 0.10)" } }
    case "alpha-15":
      return { style: { background: "rgba(255, 255, 255, 0.15)" } }
    case "alpha-20":
      return { style: { background: "rgba(255, 255, 255, 0.20)" } }
    case "alpha-30":
      return { style: { background: "rgba(255, 255, 255, 0.30)" } }
    case "alpha-50":
      return { style: { background: "rgba(255, 255, 255, 0.50)" } }

    // Basic color tokens
    case "white":
      return { className: "bg-white" }
    case "black":
      return { className: "bg-black" }
    case "transparent":
      return { className: "bg-transparent" }
    case "primary":
      return { className: "bg-primary" }
    case "accent":
      return { className: "bg-accent" }
  }

  // Raw CSS value
  if (background.startsWith("#") ||
    background.startsWith("rgb") ||
    background.startsWith("hsl") ||
    background.startsWith("linear-gradient") ||
    background.startsWith("radial-gradient")) {
    return { style: { background } }
  }

  return {}
}

// Recursive node renderer
const NodeRenderer = React.memo(({ node }: { node: WidgetNode }) => {
  const { onAction, formData, setFormValue, isDisabled, loadingActionType } = useWidgetContext()

  // Get the effective action (onClickAction or deprecated action)
  const getClickAction = (n: WidgetNode): WidgetAction | undefined => n.onClickAction || n.action

  switch (node.type) {
    case "text":
      return <span className={toTextClasses(node.variant)}>{node.value ?? ""}</span>

    case "title":
      return (
        <h3 className={cn(
          "font-semibold leading-tight",
          toSizeClasses(node.size),
          toWeightClasses(node.weight)
        )}>
          {node.value ?? ""}
        </h3>
      )

    case "caption":
      return (
        <p className={cn(
          "text-xs text-muted-foreground",
          node.color === "tertiary" && "opacity-70"
        )}>
          {node.value ?? ""}
        </p>
      )

    case "label":
      return (
        <Label htmlFor={node.fieldName} className="text-sm font-medium">
          {node.value ?? ""}
        </Label>
      )

    case "markdown":
      return <MarkdownRenderer content={node.value ?? ""} />

    case "image":
      return (
        <img
          src={node.src ?? ""}
          alt={node.alt ?? ""}
          className="rounded-md max-w-full h-auto"
          style={{
            height: typeof node.height === 'number' ? `${node.height}px` : node.height,
            width: typeof node.width === 'number' ? `${node.width}px` : node.width,
          }}
        />
      )

    case "badge":
      return <Badge variant={toBadgeVariant(node.variant)} className="lowercase">{node.label}</Badge>

    case "icon":
      return (
        <span className={cn(
          "inline-flex items-center justify-center",
          node.size === "sm" ? "w-4 h-4 text-sm" :
            node.size === "lg" ? "w-6 h-6 text-lg" : "w-5 h-5 text-base"
        )}>
          {node.iconName || "●"}
        </span>
      )

    case "button": {
      const clickAction = getClickAction(node)
      const isLoading = loadingActionType === clickAction?.type
      const shouldShowSelfLoading = clickAction?.loadingBehavior === 'self' || clickAction?.loadingBehavior === 'auto'
      return (
        <Button
          variant={toButtonVariant(node.variant)}
          size="sm"
          disabled={isDisabled || node.disabled || isLoading}
          onClick={() => clickAction && onAction(clickAction, formData)}
        >
          {isLoading && shouldShowSelfLoading ? "..." : node.label}
        </Button>
      )
    }

    case "input":
      return (
        <Input
          name={node.name}
          placeholder={node.placeholder}
          value={(node.name ? formData[node.name] as string : node.defaultValue) ?? node.defaultValue ?? ""}
          onChange={(e) => node.name && setFormValue(node.name, e.target.value)}
          disabled={isDisabled || node.disabled}
          required={node.required}
          className="w-full"
        />
      )

    case "textarea":
      return (
        <textarea
          name={node.name}
          placeholder={node.placeholder}
          value={(node.name ? formData[node.name] as string : node.defaultValue) ?? node.defaultValue ?? ""}
          onChange={(e) => node.name && setFormValue(node.name, e.target.value)}
          disabled={isDisabled || node.disabled}
          required={node.required}
          rows={node.rows || 3}
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      )

    case "select":
      return (
        <Select
          value={node.name ? (formData[node.name] as string | undefined) : undefined}
          onValueChange={(value) => node.name && setFormValue(node.name, value)}
          disabled={isDisabled || node.disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={node.placeholder ?? "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {(node.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case "checkbox": {
      const checkboxId = `checkbox-${node.name}`
      const isChecked = node.name ? (formData[node.name] as boolean | undefined) ?? node.defaultChecked : node.defaultChecked
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={checkboxId}
            checked={isChecked}
            disabled={isDisabled || node.disabled}
            onCheckedChange={(checked) => node.name && setFormValue(node.name, !!checked)}
          />
          <Label htmlFor={checkboxId} className={cn("text-sm", (isDisabled || node.disabled) ? "cursor-default" : "cursor-pointer")}>
            {node.label}
          </Label>
        </div>
      )
    }

    case "radio-group": {
      const radioValue = node.name ? (formData[node.name] as string | undefined) : undefined
      return (
        <div className={cn(
          "flex gap-2",
          node.direction === "row" ? "flex-row flex-wrap" : "flex-col"
        )}>
          {(node.options ?? []).map((opt) => {
            const radioId = `radio-${node.name}-${opt.value}`
            return (
              <div key={opt.value} className="flex items-center space-x-2">
                <input
                  type="radio"
                  id={radioId}
                  name={node.name}
                  value={opt.value}
                  checked={radioValue === opt.value}
                  onChange={() => node.name && setFormValue(node.name, opt.value)}
                  disabled={isDisabled || node.disabled}
                  className="h-4 w-4 border-border text-primary focus:ring-ring"
                />
                <Label htmlFor={radioId} className="text-sm">{opt.label}</Label>
              </div>
            )
          })}
        </div>
      )
    }

    case "row":
      return (
        <div className={cn(
          "flex flex-row flex-wrap",
          toAlignClasses(node.align) || "items-center",
          toJustifyClasses(node.justify),
          `gap-${node.gap ?? 2}`
        )}>
          {(node.children ?? []).map((child, i) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </div>
      )

    case "col":
      return (
        <div className={cn(
          "flex flex-col",
          toAlignClasses(node.align),
          toJustifyClasses(node.justify),
          `gap-${node.gap ?? 2}`
        )}>
          {(node.children ?? []).map((child, i) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </div>
      )

    case "box": {
      const bgStyles = toBackgroundStyles(node.background as string | { light?: string; dark?: string } | undefined)
      const boxStyle: React.CSSProperties = {
        ...bgStyles.style,
        minHeight: typeof node.minHeight === 'number' ? `${node.minHeight}px` : node.minHeight,
        maxHeight: typeof node.maxHeight === 'number' ? `${node.maxHeight}px` : node.maxHeight,
        minWidth: typeof node.minWidth === 'number' ? `${node.minWidth}px` : node.minWidth,
        maxWidth: typeof node.maxWidth === 'number' ? `${node.maxWidth}px` : node.maxWidth,
        aspectRatio: node.aspectRatio,
      }
      return (
        <div
          className={cn(
            "flex flex-col",
            typeof node.padding === 'number' ? `p-${node.padding}` : "p-3",
            bgStyles.className,
            toRadiusClasses(node.radius),
            `gap-${node.gap ?? 2}`
          )}
          style={boxStyle}
        >
          {(node.children ?? []).map((child, i) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </div>
      )
    }

    case "spacer":
      return <div className="flex-1" style={{ minHeight: typeof node.minSize === 'number' ? node.minSize : undefined }} />

    case "divider":
      return (
        <div className={cn(
          "w-full h-px bg-border",
          typeof node.spacing === 'number' ? `my-${node.spacing}` : "my-2"
        )} />
      )

    case "form":
      return (
        <form
          className={cn(
            "flex",
            node.direction === "row" ? "flex-row flex-wrap" : "flex-col",
            `gap-${node.gap ?? 3}`
          )}
          onSubmit={(e) => {
            e.preventDefault()
            if (node.onSubmitAction) {
              onAction(node.onSubmitAction, formData)
            }
          }}
        >
          {(node.children ?? []).map((child, i) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </form>
      )

    default:
      console.warn(`Unknown widget node type: ${node.type}`)
      return null
  }
})
NodeRenderer.displayName = "NodeRenderer"

// Helper to extract default form values from widget nodes
const extractDefaultFormValues = (nodes: WidgetNode[]): FormData => {
  const defaults: FormData = {}

  const processNode = (node: WidgetNode) => {
    // Extract default values from form fields
    if (node.name) {
      switch (node.type) {
        case 'checkbox':
          defaults[node.name] = node.defaultChecked ?? false
          break
        case 'input':
        case 'textarea':
          defaults[node.name] = node.defaultValue ?? ''
          break
        case 'select':
        case 'radio-group':
          defaults[node.name] = '' // Empty string means no selection
          break
      }
    }

    // Recursively process children
    if (node.children) {
      node.children.forEach(processNode)
    }
  }

  nodes.forEach(processNode)
  return defaults
}

// Main widget renderer
export interface WidgetRendererProps {
  widget: Widget | string
  onAction?: (action: WidgetAction, formData?: FormData) => void | Promise<void>
  className?: string
  disabled?: boolean
  /** Wrap content in a Card (default: only when title exists) */
  asCard?: boolean
}

export const WidgetRenderer = React.memo(({ widget, onAction, className, disabled, asCard }: WidgetRendererProps) => {
  // Initialize form data with default values from widget nodes
  const [formData, setFormData] = useState<FormData>(() => {
    if (typeof widget === 'string') return {}
    return extractDefaultFormValues(widget.children ?? [])
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingActionType, setLoadingActionType] = useState<string | null>(null)

  const setFormValue = (name: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleAction = async (action: WidgetAction, actionFormData?: FormData) => {
    if (disabled || isSubmitting) return

    // Merge form data with action payload (payload values override form data)
    const mergedFormData: FormData = { ...actionFormData }
    if (action.payload) {
      for (const [key, value] of Object.entries(action.payload)) {
        if (typeof value === 'string' || typeof value === 'boolean' || value === undefined) {
          mergedFormData[key] = value
        }
      }
    }

    // Set loading state based on loadingBehavior
    if (action.loadingBehavior !== 'none') {
      setIsSubmitting(true)
      if (action.loadingBehavior === 'self' || action.loadingBehavior === 'auto') {
        setLoadingActionType(action.type)
      }
    }

    try {
      await onAction?.(action, mergedFormData)
    } finally {
      setIsSubmitting(false)
      setLoadingActionType(null)
    }
  }

  const isContainerLoading = isSubmitting && loadingActionType === null
  const isDisabled = disabled || isContainerLoading

  // Handle string widget (fallback)
  if (typeof widget === "string") {
    return (
      <Card className={cn("w-full", className)}>
        <pre>{widget}</pre>
      </Card>
    )
  }

  // Determine if we should use Card wrapper
  const shouldUseCard = asCard ?? !!widget.title

  const content = (
    <div className={cn("space-y-3", isContainerLoading && "opacity-70 pointer-events-none")}>
      {(widget.children ?? []).map((node, i) => (
        <NodeRenderer key={i} node={node} />
      ))}
    </div>
  )

  if (shouldUseCard) {
    return (
      <WidgetContext.Provider value={{ onAction: handleAction, formData, setFormValue, isDisabled, loadingActionType }}>
        <Card className={cn("w-full border border-border", className)}>
          {widget.title && (
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{widget.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent>
            {content}
          </CardContent>
        </Card>
      </WidgetContext.Provider>
    )
  }

  // No Card wrapper - just render content directly
  return (
    <WidgetContext.Provider value={{ onAction: handleAction, formData, setFormValue, isDisabled, loadingActionType }}>
      <div className={cn("w-full", className)}>
        {content}
      </div>
    </WidgetContext.Provider>
  )
})
WidgetRenderer.displayName = "WidgetRenderer"
