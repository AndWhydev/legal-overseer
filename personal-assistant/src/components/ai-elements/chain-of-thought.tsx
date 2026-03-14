"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";
import { createContext, memo, useContext, useMemo, useState } from "react";
import { motion } from "motion/react";

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
      display: "flex",
      alignItems: "center",
      gap: "8px",
      cursor: "pointer",
      userSelect: "none",
      padding: "4px 0",
      color: "var(--text-dim)",
      fontSize: "13px",
      transition: "color 0.2s ease",
      ...style,
    };

    const chevronStyle: CSSProperties = {
      display: "inline-block",
      width: "12px",
      height: "12px",
      transition: "transform 0.2s ease",
      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
      flexShrink: 0,
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
        <span style={{ flex: 1, textAlign: "left" }}>
          {children ?? "Reasoning..."}
        </span>
        <svg
          style={chevronStyle}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
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
  status?: "active" | "complete" | "pending";
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ChainOfThoughtStep = memo(
  ({
    className,
    style,
    icon: Icon,
    label,
    status = "complete",
    children,
  }: ChainOfThoughtStepProps) => {
    const dotStyle: CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      flexShrink: 0,
      marginTop: "4px",
    };

    if (status === "complete") {
      dotStyle.backgroundColor = "var(--text-secondary)";
    } else if (status === "active") {
      dotStyle.backgroundColor = "var(--text-primary)";
    } else {
      // pending
      dotStyle.backgroundColor = "transparent";
      dotStyle.border = "1px solid var(--text-muted)";
    }

    const stepContainerStyle: CSSProperties = {
      display: "flex",
      gap: "12px",
      fontSize: "13px",
      position: "relative",
      ...style,
    };

    const iconWrapperStyle: CSSProperties = {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      position: "relative",
      minWidth: "6px",
      width: "6px",
    };

    const threadLineStyle: CSSProperties = {
      position: "absolute",
      top: "6px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "1px",
      height: "calc(100% + 12px)",
      backgroundColor: "var(--text-muted)",
      opacity: 0.3,
    };

    const contentStyle: CSSProperties = {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    };

    const labelStyle: CSSProperties = {
      color: "var(--text-secondary)",
      fontSize: "13px",
      fontWeight: 400,
      lineHeight: "1.4",
    };

    return (
      <div style={stepContainerStyle} className={className}>
        <div style={iconWrapperStyle}>
          {status === "active" ? (
            <motion.div
              style={dotStyle}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <div style={dotStyle} />
          )}
          {/* Thread line will be rendered by parent container */}
        </div>
        <div style={contentStyle}>
          <div style={labelStyle}>{label}</div>
          {children}
        </div>
      </div>
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

    const contentWrapperStyle: CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      marginTop: "12px",
      position: "relative",
      ...style,
    };

    // Render the vertical thread line connecting all steps
    const threadLineStyle: CSSProperties = {
      position: "absolute",
      left: "2px",
      top: "0",
      width: "1px",
      height: "100%",
      backgroundColor: "var(--text-muted)",
      opacity: 0.3,
    };

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: isOpen ? 1 : 0, height: isOpen ? "auto" : 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        style={{ overflow: "hidden" }}
      >
        <div style={contentWrapperStyle} className={className}>
          <div style={threadLineStyle} />
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
