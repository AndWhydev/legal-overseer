"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";
import { createContext, memo, useContext, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2 } from "lucide-react";

interface ChainOfThoughtContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    );
  }
  return context;
};

export interface ChainOfThoughtProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ChainOfThought = memo(
  ({
    className,
    style,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
  }: ChainOfThoughtProps) => {
    const isControlled = open !== undefined
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const isOpen = isControlled ? open! : internalOpen

    const chainOfThoughtContext = useMemo(
      () => ({
        isOpen,
        setIsOpen: (newOpen: boolean) => {
          if (!isControlled) {
            setInternalOpen(newOpen)
          }
          onOpenChange?.(newOpen)
        },
      }),
      [isOpen, isControlled, onOpenChange]
    );

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <div className={className} style={style}>
          {children}
        </div>
      </ChainOfThoughtContext.Provider>
    );
  }
);

ChainOfThought.displayName = "ChainOfThought";

export interface ChainOfThoughtHeaderProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ChainOfThoughtHeader = memo(
  ({ className, children, style }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought();

    const headerStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      cursor: "pointer",
      userSelect: "none",
      padding: "6px 12px",
      color: "var(--text-dim)",
      fontSize: "13px",
      fontWeight: 500,
      fontFamily: "inherit",
      background: "rgba(255, 255, 255, 0.03)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      borderRadius: "10px",
      transition: "all 0.2s ease",
      backdropFilter: "blur(8px)",
      ...style,
    };

    const chevronStyle: CSSProperties = {
      display: "inline-block",
      width: "14px",
      height: "14px",
      transition: "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
      flexShrink: 0,
      opacity: 0.6,
    };

    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={headerStyle}
        className={className}
        onMouseEnter={(e) => {
          const element = e.currentTarget as HTMLElement;
          element.style.color = "var(--text-secondary)";
          element.style.background = "rgba(255, 255, 255, 0.06)";
          element.style.borderColor = "rgba(255, 255, 255, 0.1)";
        }}
        onMouseLeave={(e) => {
          const element = e.currentTarget as HTMLElement;
          element.style.color = "var(--text-dim)";
          element.style.background = "rgba(255, 255, 255, 0.03)";
          element.style.borderColor = "rgba(255, 255, 255, 0.06)";
        }}
      >
        {/* Sparkle indicator */}
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          opacity: 0.5,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" />
          </svg>
        </span>
        <span style={{ textAlign: "left", letterSpacing: "-0.01em" }}>
          {children ?? "Reasoning..."}
        </span>
        <svg
          style={chevronStyle}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    );
  }
);

ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";

export interface ChainOfThoughtStepProps {
  icon?: ElementType;
  label: string;
  detail?: string;
  resultSummary?: string;
  status?: "active" | "complete" | "pending";
  expandable?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// Consistent icon column width for alignment — all steps share the same axis
const ICON_COL = 28;

/** Spinning loader for active tool calls */
const ActiveSpinner = memo(() => (
  <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Loader2 size={14} style={{ color: "var(--bb-orange-light)", flexShrink: 0 }} />
  </motion.div>
));
ActiveSpinner.displayName = "ActiveSpinner";

/** Checkmark for completed tool calls */
const CompletedCheck = memo(() => (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Check size={12} style={{ color: "var(--bb-green)", flexShrink: 0 }} />
  </motion.div>
));
CompletedCheck.displayName = "CompletedCheck";

export const ChainOfThoughtStep = memo(
  ({
    className,
    style,
    icon: Icon,
    label,
    detail,
    resultSummary,
    status = "complete",
    expandable = false,
    children,
  }: ChainOfThoughtStepProps) => {
    const hasIcon = !!Icon;
    const [expanded, setExpanded] = useState(false);

    const handleClick = useCallback(() => {
      if (expandable) setExpanded(prev => !prev);
    }, [expandable]);

    // Icon container background based on status
    const iconBg =
      status === "active"
        ? "rgba(255, 122, 69, 0.12)"
        : status === "complete"
          ? "rgba(34, 197, 94, 0.08)"
          : "rgba(255, 255, 255, 0.04)";

    const iconColor =
      status === "active"
        ? "var(--bb-orange-light)"
        : status === "complete"
          ? "var(--text-dim)"
          : "var(--text-muted)";

    const iconElement = hasIcon ? (
      <Icon size={14} style={{ color: iconColor, flexShrink: 0 }} />
    ) : (
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor:
            status === "pending" ? "transparent" : iconColor,
          border:
            status === "pending"
              ? `1px solid var(--text-muted)`
              : "none",
        }}
      />
    );

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
        style={{
          display: "flex",
          gap: 10,
          fontSize: 13,
          paddingBottom: 6,
          paddingTop: 2,
          position: "relative",
          zIndex: 1,
          ...(expandable ? { cursor: "pointer" } : {}),
          ...style,
        }}
        className={`cot-step ${className ?? ""}`}
        onClick={handleClick}
      >
        {/* Icon column — centered with subtle background */}
        <div
          style={{
            width: ICON_COL,
            minWidth: ICON_COL,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 24,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: iconBg,
              transition: "background 0.3s ease",
            }}
          >
            {status === "active" ? (
              hasIcon ? (
                <motion.div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {iconElement}
                </motion.div>
              ) : (
                <motion.div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  {iconElement}
                </motion.div>
              )
            ) : (
              iconElement
            )}
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minHeight: 24,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
              lineHeight: "24px",
            }}
          >
            {/* Label */}
            <span
              style={{
                color: status === "active" ? "var(--text-secondary)" : "var(--text-dim)",
                fontSize: 13,
                fontWeight: status === "active" ? 500 : 400,
                transition: "color 0.2s ease",
              }}
            >
              {label}
            </span>

            {/* Detail pill — glassmorphic badge */}
            {detail && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 10px",
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {detail}
              </span>
            )}

            {/* Status indicator — spinner or checkmark */}
            {status === "active" && (
              <ActiveSpinner />
            )}
            {status === "complete" && hasIcon && (
              <CompletedCheck />
            )}

            {/* Expandable chevron */}
            {expandable && (
              <svg
                style={{
                  width: 12,
                  height: 12,
                  color: "var(--text-muted)",
                  transition: "transform 0.2s ease",
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  flexShrink: 0,
                  opacity: 0.6,
                }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>

          {/* Result summary — shown after tool completes */}
          {resultSummary && status === "complete" && (
            <motion.span
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 400,
                lineHeight: "16px",
                paddingLeft: 1,
              }}
            >
              {resultSummary}
            </motion.span>
          )}

          {/* Expandable children — sub-list */}
          {expandable && expanded && children && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 0,
                paddingTop: 4,
                paddingLeft: 0,
                overflow: "hidden",
              }}
            >
              {children}
            </motion.div>
          )}
          {/* Non-expandable children (narration, etc.) */}
          {!expandable && children}
        </div>
      </motion.div>
    );
  }
);

ChainOfThoughtStep.displayName = "ChainOfThoughtStep";

export interface ChainOfThoughtContentProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ChainOfThoughtContent = memo(
  ({ className, children, style }: ChainOfThoughtContentProps) => {
    const { isOpen } = useChainOfThought();

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{
          opacity: isOpen ? 1 : 0,
          height: isOpen ? "auto" : 0,
        }}
        transition={{
          duration: 0.3,
          ease: [0.25, 1, 0.5, 1],
          opacity: { duration: 0.2 },
        }}
        style={{ overflow: "hidden" }}
      >
        <motion.div
          layout
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            marginTop: 8,
            paddingBottom: 0,
            paddingLeft: 4,
            position: "relative",
            ...style,
          }}
          className={`cot-content ${className ?? ""}`}
        >
          {/* Continuous thread line — runs through the icon column center */}
          <div
            className="cot-thread-line"
            style={{
              position: "absolute",
              left: 4 + ICON_COL / 2 - 0.5, // paddingLeft + center of icon column minus half line width
              top: 12, // first icon center
              bottom: 16, // last icon center
              width: 1,
              background: "linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          <AnimatePresence initial={false}>
            {children}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    );
  }
);

ChainOfThoughtContent.displayName = "ChainOfThoughtContent";

export interface ChainOfThoughtSearchResultsProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ChainOfThoughtSearchResults = memo(
  ({
    className,
    style,
    children,
  }: ChainOfThoughtSearchResultsProps) => {
    const wrapperStyle: CSSProperties = {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      marginTop: "8px",
      ...style,
    };

    return (
      <div style={wrapperStyle} className={className}>
        {children}
      </div>
    );
  }
);

ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";

export interface ChainOfThoughtSearchResultProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ChainOfThoughtSearchResult = memo(
  ({
    className,
    style,
    children,
  }: ChainOfThoughtSearchResultProps) => {
    const pillStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      backgroundColor: "var(--text-muted)",
      opacity: 0.1,
      borderRadius: "4px",
      fontSize: "12px",
      color: "var(--text-secondary)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      ...style,
    };

    return (
      <div style={pillStyle} className={className}>
        {children}
      </div>
    );
  }
);

ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";

export interface ChainOfThoughtImageProps {
  children?: ReactNode;
  caption?: string;
  className?: string;
  style?: CSSProperties;
}

export const ChainOfThoughtImage = memo(
  ({
    className,
    style,
    children,
    caption,
  }: ChainOfThoughtImageProps) => {
    const containerStyle: CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "8px",
      ...style,
    };

    const imageWrapperStyle: CSSProperties = {
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      maxHeight: "352px",
      overflow: "hidden",
      borderRadius: "6px",
      backgroundColor: "var(--text-muted)",
      opacity: 0.05,
      padding: "12px",
    };

    const captionStyle: CSSProperties = {
      fontSize: "12px",
      color: "var(--text-muted)",
      lineHeight: "1.4",
    };

    return (
      <div style={containerStyle} className={className}>
        <div style={imageWrapperStyle}>
          {children}
        </div>
        {caption && <p style={captionStyle}>{caption}</p>}
      </div>
    );
  }
);

ChainOfThoughtImage.displayName = "ChainOfThoughtImage";
