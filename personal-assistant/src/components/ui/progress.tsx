"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        asChild
      >
        <motion.div
          className="size-full flex-1 bg-primary"
          animate={{ x: `-${100 - (value || 0)}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 30 }}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
