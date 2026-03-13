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

/* ── Sparkle shape (4-point star) ── */
function SparkleShape({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 0C12 0 13.5 8.5 12 12C10.5 8.5 12 0 12 0Z"
        fill={color}
      />
      <path
        d="M12 24C12 24 10.5 15.5 12 12C13.5 15.5 12 24 12 24Z"
        fill={color}
      />
      <path
        d="M0 12C0 12 8.5 10.5 12 12C8.5 13.5 0 12 0 12Z"
        fill={color}
      />
      <path
        d="M24 12C24 12 15.5 13.5 12 12C15.5 10.5 24 12 24 12Z"
        fill={color}
      />
    </svg>
  );
}

/* ── Individual sparkle with random position and twinkle ── */
function Sparkle({
  index,
  total,
}: {
  index: number;
  total: number;
}) {
  // Deterministic pseudo-random based on index
  const seed = (i: number, m: number) => ((i * 7919 + 104729) % m) / m;
  const angle = seed(index, 360) * Math.PI * 2;
  const dist = 44 + seed(index + 1, 100) * 52;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;
  const size = 6 + seed(index + 2, 100) * 12;
  const duration = 1.2 + seed(index + 3, 100) * 2.0;
  const delay = seed(index + 4, 100) * 2.5;
  const drift = -8 - seed(index + 5, 100) * 16;

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
      }}
      initial={{ opacity: 0, x, y, scale: 0, rotate: 0 }}
      animate={{
        opacity: [0, 1, 0.6, 1, 0],
        x: [x, x + seed(index + 6, 100) * 8 - 4],
        y: [y, y + drift],
        scale: [0, 1.2, 0.7, 1, 0],
        rotate: [0, 90 + seed(index + 7, 180) * 90],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <SparkleShape size={size} color="var(--sparkle-color)" />
    </motion.div>
  );
}

/* ── Micro-sparkle: tiny twinkle dots ── */
function MicroSparkle({ index }: { index: number }) {
  const seed = (i: number, m: number) => ((i * 6841 + 83497) % m) / m;
  const angle = seed(index, 628) * Math.PI * 2;
  const dist = 30 + seed(index + 1, 100) * 80;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;
  const size = 1.5 + seed(index + 2, 100) * 2.5;
  const duration = 0.6 + seed(index + 3, 100) * 1.4;
  const delay = seed(index + 4, 100) * 3;

  return (
    <motion.div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--sparkle-color)',
        top: '50%',
        left: '50%',
      }}
      initial={{ opacity: 0, x, y, scale: 0 }}
      animate={{
        opacity: [0, 0.9, 0],
        x,
        y,
        scale: [0, 1, 0],
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

/* ── Shimmer ring — rotating arc of light ── */
function ShimmerRing() {
  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: -24,
        borderRadius: '50%',
        background: 'conic-gradient(from 0deg, transparent 0%, var(--shimmer-color) 10%, transparent 20%, transparent 50%, var(--shimmer-color) 60%, transparent 70%)',
        opacity: 0.5,
      }}
      animate={{ rotate: 360 }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}

/* ── Breathing glow ── */
function BreathingGlow() {
  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: -28,
        borderRadius: '50%',
        background:
          'radial-gradient(circle, var(--glow-color) 0%, transparent 70%)',
      }}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{
        scale: [0.6, 1, 1.3, 1],
        opacity: [0, 0.3, 0.6, 0.3],
      }}
      transition={{
        duration: 3,
        delay: 0.3,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/* ── Loading shimmer bar ── */
function LoadingShimmer() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
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

  // Stable sparkle arrays
  const sparkles = useMemo(() => Array.from({ length: 12 }), []);
  const microSparkles = useMemo(() => Array.from({ length: 20 }), []);

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
                  animate={{
                    marginRight: phase >= 1 ? 16 : 0,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 280,
                    damping: 22,
                  }}
                >
                  {/* Shimmer ring */}
                  <ShimmerRing />

                  {/* Breathing glow */}
                  <BreathingGlow />

                  {/* 4-point star sparkles */}
                  {sparkles.map((_, i) => (
                    <Sparkle key={`s-${i}`} index={i} total={12} />
                  ))}

                  {/* Micro twinkle dots */}
                  {microSparkles.map((_, i) => (
                    <MicroSparkle key={`m-${i}`} index={i} />
                  ))}

                  {/* Logo */}
                  <motion.img
                    src="/bitbit-logo.svg"
                    alt="BitBit"
                    width={72}
                    height={72}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      filter: 'var(--splash-logo-filter, brightness(0) invert(1)) drop-shadow(0 0 24px var(--glow-color))',
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
                <div style={{ overflow: 'visible' }}>
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
                          color: 'var(--text-primary)',
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

              {/* Loading shimmer — appears after text */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 1 ? 1 : 0 }}
                transition={{ delay: phase >= 1 ? 0.4 : 0, duration: 0.3 }}
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
