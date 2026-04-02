'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface TabTransitionProps {
  tabId: string;
  direction: 'up' | 'down' | null;
  children: React.ReactNode;
}

const spring = { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.8 };

const variants = {
  enter: (dir: 'up' | 'down' | null) => ({
    y: dir === 'down' ? 24 : dir === 'up' ? -24 : 0,
    opacity: 0,
    filter: 'blur(2px)',
  }),
  center: {
    y: 0,
    opacity: 1,
    filter: 'blur(0px)',
  },
  exit: (dir: 'up' | 'down' | null) => ({
    y: dir === 'down' ? -16 : dir === 'up' ? 16 : 0,
    opacity: 0,
    filter: 'blur(2px)',
  }),
};

export function TabTransition({ tabId, direction, children }: TabTransitionProps) {
  return (
    <AnimatePresence mode="popLayout" custom={direction}>
      <motion.div
        key={tabId}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={spring}
        className="h-full"
        role="tabpanel"
        id={`tabpanel-${tabId}`}
        aria-labelledby={`tab-${tabId}`}
        tabIndex={0}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
