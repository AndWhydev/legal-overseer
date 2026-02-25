'use client'

import { motion } from 'motion/react'

export function BitBitLogoAnimated({ size = 120 }: { size?: number }) {
  const h = size / 2
  const orange = '#FF5A1F'

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 120 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left "b" - main body (without top-left corner) */}
      <motion.path
        d="M8 14V52H12V56H32V52H36V44H32V40H20V16H36V14H32V10H12V14H8Z
           M20 44H28V52H20V44Z"
        fill={orange}
        fillRule="evenodd"
        animate={{
          filter: [
            'drop-shadow(0 0 4px rgba(255,90,31,0.15))',
            'drop-shadow(0 0 8px rgba(255,90,31,0.3))',
            'drop-shadow(0 0 4px rgba(255,90,31,0.15))',
          ],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Detached corner piece */}
      <motion.rect
        x="4"
        y="2"
        width="10"
        height="10"
        rx="1"
        fill={orange}
        animate={{
          y: [-1, 2, -1],
          rotate: [-5, 5, -5],
          scale: [0.95, 1.05, 0.95],
        }}
        transition={{
          y: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          rotate: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
          scale: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 },
        }}
        style={{ originX: '9px', originY: '7px' }}
      />

      {/* Right "b" */}
      <motion.path
        d="M52 4V52H56V56H76V52H80V44H76V40H64V8H80V4H76V0H56V4H52Z
           M64 44H72V52H64V44Z"
        fill={orange}
        fillRule="evenodd"
        animate={{
          filter: [
            'drop-shadow(0 0 4px rgba(255,90,31,0.15))',
            'drop-shadow(0 0 8px rgba(255,90,31,0.3))',
            'drop-shadow(0 0 4px rgba(255,90,31,0.15))',
          ],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      />
    </svg>
  )
}
