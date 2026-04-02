'use client';

import React, { useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'motion/react';

/**
 * KeepAliveTabPanel — renders all visited tabs simultaneously.
 *
 * Active tab: visible + plays a spring enter animation on switch.
 * Inactive tabs: display:none — zero layout/paint cost, full React
 * state + scroll position + fetched data preserved in the DOM.
 *
 * The splash screen ensures all code is loaded before the user sees
 * anything. Tabs are never unmounted once visited.
 */

interface TabEntry {
  id: string;
  children: React.ReactNode;
}

interface KeepAliveTabPanelProps {
  activeTabId: string;
  direction: 'up' | 'down' | null;
  tabs: TabEntry[];
}

const spring = { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.8 };

/**
 * Individual tab wrapper. Uses imperative animation controls so the
 * component never remounts — children stay alive across tab switches.
 */
function TabPane({
  id,
  isActive,
  direction,
  children,
}: {
  id: string;
  isActive: boolean;
  direction: 'up' | 'down' | null;
  children: React.ReactNode;
}) {
  const controls = useAnimationControls();
  const hasBeenActiveRef = useRef(false);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      // Tab just became active — play enter animation
      const y = direction === 'down' ? 24 : direction === 'up' ? -24 : 12;
      controls.set({ y, opacity: 0, filter: 'blur(2px)' });
      controls.start({ y: 0, opacity: 1, filter: 'blur(0px)' });
    } else if (isActive && !hasBeenActiveRef.current) {
      // First mount as active (initial load) — no animation, just show
      controls.set({ y: 0, opacity: 1, filter: 'blur(0px)' });
    }

    wasActiveRef.current = isActive;
    if (isActive) hasBeenActiveRef.current = true;
  }, [isActive, direction, controls]);

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      aria-hidden={!isActive}
      tabIndex={isActive ? 0 : -1}
      style={{ display: isActive ? 'contents' : 'none' }}
    >
      <motion.div
        animate={controls}
        transition={spring}
        className="h-full"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function KeepAliveTabPanel({ activeTabId, direction, tabs }: KeepAliveTabPanelProps) {
  return (
    <>
      {tabs.map(tab => (
        <TabPane
          key={tab.id}
          id={tab.id}
          isActive={tab.id === activeTabId}
          direction={direction}
          children={tab.children}
        />
      ))}
    </>
  );
}
