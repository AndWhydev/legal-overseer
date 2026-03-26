"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";
import { createContext, memo, useContext, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

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
  /** Hide the expand/collapse chevron (e.g. when there's no content to expand) */
  hideChevron?: boolean;
}

export const ChainOfThoughtHeader = memo(
  ({ className, children, style, hideChevron }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought();

    const headerStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      cursor: "pointer",
      userSelect: "none",
      padding: "4px 0",
      color: "var(--text-dim)",
      fontSize: "14px",
      fontWeight: 400,
      fontFamily: "inherit",
      background: "none",
      border: "none",
      transition: "color 0.2s ease",
      ...style,
    };

    const chevronStyle: CSSProperties = {
      display: "inline-block",
      width: "12px",
      height: "12px",
      transition: "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
      flexShrink: 0,
      color: "var(--text-secondary, rgba(255,255,255,0.55))",
    };

    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={headerStyle}
        className={className}
        onMouseEnter={(e) => {
          const element = e.currentTarget as HTMLElement;
          element.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          const element = e.currentTarget as HTMLElement;
          element.style.color = "var(--text-dim)";
        }}
      >
        <span style={{ textAlign: "left" }}>
          {children ?? "Reasoning..."}
        </span>
        {!hideChevron && <svg
          style={chevronStyle}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>}
      </button>
    );
  }
);

ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";

export interface ChainOfThoughtStepProps {
  icon?: ElementType;
  label: string;
  detail?: string;
  status?: "active" | "complete" | "pending";
  expandable?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// Consistent icon column width for alignment — all steps share the same axis
const ICON_COL = 18;

export const ChainOfThoughtStep = memo(
  ({
    className,
    style,
    icon: Icon,
    label,
    detail,
    status = "complete",
    expandable = false,
    children,
  }: ChainOfThoughtStepProps) => {
    const hasIcon = !!Icon;
    const [expanded, setExpanded] = useState(false);

    const iconColor =
      status === "active"
        ? "var(--text-secondary)"
        : status === "complete"
          ? "var(--text-muted)"
          : "var(--text-muted)";

    const iconElement = hasIcon ? (
      <Icon size={13} style={{ color: iconColor, flexShrink: 0 }} />
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

    const handleClick = useCallback(() => {
      if (expandable) setExpanded(prev => !prev);
    }, [expandable]);

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          fontSize: 14,
          paddingBottom: 4,
          position: "relative",
          zIndex: 1,
          ...(expandable ? { cursor: "pointer" } : {}),
          ...style,
        }}
        className={`cot-step ${className ?? ""}`}
        onClick={handleClick}
      >
        {/* Icon column — fixed width, top-aligned with first line of text */}
        <div
          style={{
            width: ICON_COL,
            minWidth: ICON_COL,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 3,
          }}
        >
          {status === "active" ? (
            <motion.div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              initial={hasIcon ? { opacity: 0.5 } : { scale: 1 }}
              animate={
                hasIcon
                  ? { opacity: [0.5, 1, 0.5] }
                  : { scale: [1, 1.3, 1] }
              }
              transition={{
                duration: hasIcon ? 1.5 : 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              {iconElement}
            </motion.div>
          ) : (
            iconElement
          )}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              lineHeight: "18px",
            }}
          >
            <span
              style={{
                color: status === "active" ? "var(--text-dim)" : "var(--text-muted)",
                fontSize: 14,
                fontWeight: 400,
              }}
            >
              {label}
            </span>
            {detail && (
              <span
                style={{
                  display: "inline-flex",
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "var(--hover-bg)",
                  fontSize: 14,
                  color: "var(--text-muted)",
                  fontStyle: "normal",
                  fontWeight: 400,
                  letterSpacing: "0.01em",
                  lineHeight: "18px",
                }}
              >
                {detail}
              </span>
            )}
            {expandable && (
              <svg
                style={{
                  width: 12,
                  height: 12,
                  marginLeft: 4,
                  color: "var(--text-muted)",
                  transition: "transform 0.2s ease",
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  flexShrink: 0,
                }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            marginTop: 8,
            paddingBottom: 0,
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
              left: ICON_COL / 2 - 0.5, // center of icon column minus half line width
              top: 8,
              bottom: 14,
              width: 1,
              backgroundColor: "var(--glass-divider)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          {children}
        </div>
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
      gap: "8px",
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
      borderRadius: "8px",
      fontSize: "14px",
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
      borderRadius: "8px",
      backgroundColor: "var(--text-muted)",
      opacity: 0.05,
      padding: "12px",
    };

    const captionStyle: CSSProperties = {
      fontSize: "14px",
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
