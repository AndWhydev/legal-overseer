"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

interface SlideProps {
  children: ReactNode;
  className?: string;
}

export function Slide({ children, className = "" }: SlideProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex min-h-screen w-full flex-col items-center justify-center px-8 py-16 md:px-16 lg:px-24 ${className}`}
    >
      <div className="w-full max-w-4xl">{children}</div>
    </motion.div>
  );
}
