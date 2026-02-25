'use client';

import { useState, useEffect, useRef } from 'react';
import {
  motion,
  AnimatePresence,
} from 'motion/react';

interface SplashScreenProps {
  ready?: boolean;
  minDisplayMs?: number;
  children: React.ReactNode;
}

/* ── Orbiting particle ── */
function Particle({ index, total }: { index: number; total: number }) {
  const angle = (index / total) * Math.PI * 2;
  const radius = 56 + (index % 3) * 10;
  const duration = 3 + (index % 3) * 0.8;
  const size = 2.5 + (index % 3);
  const delay = index * 0.1;

  return (
    <motion.div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#FF5A1F',
        top: '50%',
        left: '50%',
        filter: `blur(${index % 2 === 0 ? 0 : 0.5}px)`,
      }}
      initial={{ opacity: 0, x: 0, y: 0 }}
      animate={{
        opacity: [0, 0.8, 0.4, 0.8, 0],
        x: [
          Math.cos(angle) * radius * 0.3,
          Math.cos(angle + Math.PI * 0.5) * radius,
          Math.cos(angle + Math.PI) * radius * 1.1,
          Math.cos(angle + Math.PI * 1.5) * radius,
          Math.cos(angle + Math.PI * 2) * radius * 0.3,
        ],
        y: [
          Math.sin(angle) * radius * 0.3,
          Math.sin(angle + Math.PI * 0.5) * radius,
          Math.sin(angle + Math.PI) * radius * 1.1,
          Math.sin(angle + Math.PI * 1.5) * radius,
          Math.sin(angle + Math.PI * 2) * radius * 0.3,
        ],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/* ── Bouncing loading dots ── */
function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#FF5A1F',
          }}
          initial={{ opacity: 0.3, y: 0 }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -8, 0] }}
          transition={{
            duration: 0.8,
            delay: i * 0.1,
            repeat: Infinity,
            ease: [0.25, 1, 0.5, 1],
          }}
        />
      ))}
    </div>
  );
}

export function SplashScreen({
  ready = false,
  minDisplayMs = 1200,
  children,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const [exiting, setExiting] = useState(false);
  // Phase 0: logo enters center
  // Phase 1: logo swooshes left, text swipes in from right
  const [phase, setPhase] = useState(0);

  // Min display timer
  useEffect(() => {
    const timer = setTimeout(() => setCanDismiss(true), minDisplayMs);
    return () => clearTimeout(timer);
  }, [minDisplayMs]);

  // Logo enters center first, then after 600ms swooshes left + text appears
  useEffect(() => {
    const timer = setTimeout(() => setPhase(1), 650);
    return () => clearTimeout(timer);
  }, []);

  // Trigger exit when ready + min time elapsed
  useEffect(() => {
    if (!ready || !canDismiss) return;
    setExiting(true);
  }, [ready, canDismiss]);

  // Remove from DOM after exit animation
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(timer);
  }, [exiting]);

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            className="bb-splash"
            initial={{ opacity: 1 }}
            animate={exiting ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
            aria-hidden={exiting}
          >
            <motion.div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 32,
              }}
              animate={
                exiting
                  ? { scale: 0.85, opacity: 0, y: -16 }
                  : { scale: 1, opacity: 1, y: 0 }
              }
              transition={{
                type: 'spring',
                stiffness: 200,
                damping: 25,
              }}
            >
              {/* Logo + Text lockup row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  position: 'relative',
                  height: 96,
                }}
              >
                {/* Logo container — starts centered, swooshes left */}
                <motion.div
                  style={{
                    position: 'relative',
                    width: 80,
                    height: 80,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  // In phase 0, logo is at x:0 (centered via parent flex)
                  // In phase 1, we add marginRight so text has room
                  animate={{
                    marginRight: phase >= 1 ? 16 : 0,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 280,
                    damping: 22,
                  }}
                >
                  {/* Orbiting particles */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Particle key={i} index={i} total={8} />
                  ))}

                  {/* Pulsing glow */}
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: -20,
                      borderRadius: '50%',
                      background:
                        'radial-gradient(circle, rgba(255, 90, 31, 0.3) 0%, transparent 70%)',
                    }}
                    animate={{
                      scale: [0.85, 1.2, 0.85],
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />

                  {/* Logo */}
                  <motion.img
                    src="/bitbit-logo.svg"
                    alt="BitBit"
                    width={72}
                    height={72}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      filter: 'drop-shadow(0 0 20px rgba(255, 90, 31, 0.3))',
                    }}
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 260,
                      damping: 18,
                      delay: 0.1,
                    }}
                  />
                </motion.div>

                {/* Text — swipes in from right after logo swooshes */}
                <div style={{ overflow: 'hidden' }}>
                  <motion.div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      whiteSpace: 'nowrap',
                    }}
                    initial={{ x: 60, opacity: 0 }}
                    animate={
                      phase >= 1
                        ? { x: 0, opacity: 1 }
                        : { x: 60, opacity: 0 }
                    }
                    transition={{
                      type: 'spring',
                      stiffness: 240,
                      damping: 20,
                      delay: phase >= 1 ? 0.05 : 0,
                    }}
                  >
                    {'BitBit'.split('').map((letter, i) => (
                      <motion.span
                        key={i}
                        style={{
                          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                          fontSize: 28,
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          color: 'var(--text-primary, #F1F5F9)',
                          display: 'inline-block',
                        }}
                        initial={{ opacity: 0, y: 12 }}
                        animate={
                          phase >= 1
                            ? { opacity: 1, y: 0 }
                            : { opacity: 0, y: 12 }
                        }
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 20,
                          delay: phase >= 1 ? 0.1 + i * 0.05 : 0,
                        }}
                      >
                        {letter}
                      </motion.span>
                    ))}
                  </motion.div>
                </div>
              </div>

              {/* Loading dots — appears after text */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 1 ? 1 : 0 }}
                transition={{ delay: phase >= 1 ? 0.4 : 0, duration: 0.3 }}
              >
                <LoadingDots />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ visibility: visible && !exiting ? 'hidden' : 'visible' }}>
        {children}
      </div>
    </>
  );
}

export default SplashScreen;
