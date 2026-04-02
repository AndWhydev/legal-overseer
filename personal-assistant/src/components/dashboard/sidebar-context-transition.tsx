'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Separator } from '@/components/ui/separator';

interface SidebarContextTransitionProps {
  contextKey: string | null;
  children: React.ReactNode;
}

const spring = { type: 'spring' as const, stiffness: 320, damping: 28 };

export function SidebarContextTransition({ contextKey, children }: SidebarContextTransitionProps) {
  return (
    <AnimatePresence mode="popLayout">
      {contextKey && (
        <motion.div
          key={contextKey}
          initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
          transition={spring}
          className="min-h-[20rem] max-h-[48%] shrink-0 overflow-hidden px-2 pb-2"
        >
          <Separator className="mx-0 mb-3" />
          <div className="h-full min-h-0 overflow-y-auto">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
