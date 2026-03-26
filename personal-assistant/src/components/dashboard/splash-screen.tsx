'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  motion,
  AnimatePresence,
} from 'motion/react';

interface SplashScreenProps {
  ready?: boolean;
  /** Code modules loaded */
  codeReady?: boolean;
  /** Data fetched */
  dataReady?: boolean;
  minDisplayMs?: number;
  children: React.ReactNode;
}

/* ── Floating particle — a single gentle drifting dot with organic motion ── */
function FloatingParticle({ index }: { index: number }) {
  const seed = (i: number, m: number) => ((i * 7919 + 104729) % m) / m;

  const baseRadius = 54 + seed(index, 100) * 28;
  const startAngle = seed(index + 1, 360) * 360;
  const duration = 8 + seed(index + 2, 100) * 8;
  const size = 2 + seed(index + 3, 100) * 2;
  const delay = seed(index + 4, 100) * 3;
  const opacity = 0.25 + seed(index + 5, 100) * 0.45;
  const direction = index % 2 === 0 ? 1 : -1;

  // Generate 8 waypoints with varying radii for a wobbly, organic path
  const steps = 8;
  const xPoints: number[] = [];
  const yPoints: number[] = [];
  for (let s = 0; s <= steps; s++) {
    const angle = startAngle + (s * 360 * direction) / steps;
    // Vary radius per waypoint — creates a soft, irregular loop
    const wobble = baseRadius * (0.85 + seed(index * 13 + s * 7, 100) * 0.3);
    const rad = (angle * Math.PI) / 180;
    xPoints.push(Math.cos(rad) * wobble);
    yPoints.push(Math.sin(rad) * wobble);
  }

  return (
    <motion.div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        background: 'var(--particle-color)',
      }}
      initial={{
        opacity: 0,
        x: xPoints[0],
        y: yPoints[0],
      }}
      animate={{
        opacity: [0, opacity, opacity, opacity, opacity, opacity, opacity, 0, 0],
        x: xPoints,
        y: yPoints,
        scale: [1, 1.15, 0.9, 1.1, 0.95, 1.05, 1, 0.9, 1],
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

/* ── Subtle ambient glow — single soft pulse behind logo ── */
function AmbientGlow() {
  return (
    <motion.div
      style={{
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--glow-color) 0%, transparent 70%)',
        top: '50%',
        left: '50%',
        marginLeft: -60,
        marginTop: -60,
        pointerEvents: 'none',
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: [0.8, 1.1, 0.8],
        opacity: [0.15, 0.35, 0.15],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/* ── Loading shimmer — bouncing dots ── */
function LoadingShimmer() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          style={{
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: 'var(--text-primary)',
          }}
          initial={{ opacity: 0.2, y: 0, scale: 0.8 }}
          animate={{
            opacity: [0.2, 1, 0.2],
            y: [0, -6, 0],
            scale: [0.8, 1.3, 0.8],
          }}
          transition={{
            duration: 0.9,
            delay: i * 0.12,
            repeat: Infinity,
            ease: [0.25, 1, 0.5, 1],
          }}
        />
      ))}
    </div>
  );
}

export function SplashScreen({
  ready: readyProp,
  codeReady,
  dataReady,
  minDisplayMs = 1200,
  children,
}: SplashScreenProps) {
  const ready = readyProp ?? ((codeReady ?? false) && (dataReady ?? false));
  const [visible, setVisible] = useState(true);
  const [canDismiss, setCanDismiss] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [phase, setPhase] = useState(0);

  // Min display timer
  useEffect(() => {
    const timer = setTimeout(() => setCanDismiss(true), minDisplayMs);
    return () => clearTimeout(timer);
  }, [minDisplayMs]);

  // Logo enters center first, then after 650ms swooshes left + text appears
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

  // Stable particle array
  const particles = useMemo(() => Array.from({ length: 6 }), []);

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
                gap: 28,
              }}
              initial={{ scale: 1, opacity: 1, y: 0 }}
              animate={
                exiting
                  ? { scale: 0.9, opacity: 0, y: -12 }
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
                  animate={{
                    marginRight: phase >= 1 ? 16 : 0,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 280,
                    damping: 22,
                  }}
                >
                  {/* Ambient glow — soft pulse */}
                  <AmbientGlow />

                  {/* Floating particles — gentle orbit */}
                  {particles.map((_, i) => (
                    <FloatingParticle key={`p-${i}`} index={i} />
                  ))}

                  {/* Logo — blur-to-sharp reveal */}
                  <motion.img
                    src="/bitbit-logo.svg"
                    alt="BitBit"
                    width={72}
                    height={72}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      filter: 'var(--splash-logo-filter, brightness(0) invert(1))',
                    }}
                    initial={{ scale: 0.6, opacity: 0, filter: 'var(--splash-logo-filter, brightness(0) invert(1)) blur(8px)' }}
                    animate={{ scale: 1, opacity: 1, filter: 'var(--splash-logo-filter, brightness(0) invert(1)) blur(0px)' }}
                    transition={{
                      duration: 0.7,
                      ease: [0.25, 1, 0.5, 1],
                      delay: 0.05,
                    }}
                  />
                </motion.div>

                {/* Text — swipes in from right after logo swooshes */}
                <div style={{ overflow: 'visible' }}>
                  <motion.div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      whiteSpace: 'nowrap',
                    }}
                    initial={{ x: 40, opacity: 0 }}
                    animate={
                      phase >= 1
                        ? { x: 0, opacity: 1 }
                        : { x: 40, opacity: 0 }
                    }
                    transition={{
                      type: 'spring',
                      stiffness: 240,
                      damping: 22,
                      delay: phase >= 1 ? 0.05 : 0,
                    }}
                  >
                    {'BitBit'.split('').map((letter, i) => (
                      <motion.span
                        key={i}
                        style={{
                          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                          fontSize: 16,
                          fontWeight: 500,
                          letterSpacing: '0.04em',
                          color: 'var(--text-primary)',
                          display: 'inline-block',
                        }}
                        initial={{ opacity: 0, y: 8 }}
                        animate={
                          phase >= 1
                            ? { opacity: 1, y: 0 }
                            : { opacity: 0, y: 8 }
                        }
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 22,
                          delay: phase >= 1 ? 0.08 + i * 0.04 : 0,
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
                transition={{ delay: phase >= 1 ? 0.35 : 0, duration: 0.4 }}
              >
                <LoadingShimmer />
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
