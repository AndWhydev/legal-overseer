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

/* ── Orbital ring — thin SVG circle that draws itself ── */
function OrbitalRing() {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <motion.div
      style={{
        position: 'absolute',
        inset: -16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      initial={{ rotate: 0 }}
      animate={{ rotate: 360 }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 112 112"
        fill="none"
        style={{ overflow: 'visible' }}
      >
        {/* Track — faint full circle */}
        <circle
          cx="56"
          cy="56"
          r={radius}
          stroke="var(--ring-track-color)"
          strokeWidth="1"
          fill="none"
        />
        {/* Arc — animated dash that chases around the ring */}
        <motion.circle
          cx="56"
          cy="56"
          r={radius}
          stroke="var(--ring-arc-color)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          initial={{
            strokeDasharray: `${circumference * 0.3} ${circumference * 0.7}`,
            strokeDashoffset: 0,
          }}
          animate={{
            strokeDashoffset: -circumference,
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      </svg>
    </motion.div>
  );
}

/* ── Floating particle — a single gentle orbiting dot ── */
function FloatingParticle({ index }: { index: number }) {
  const seed = (i: number, m: number) => ((i * 7919 + 104729) % m) / m;

  const orbitRadius = 58 + seed(index, 100) * 24;
  const startAngle = seed(index + 1, 360) * 360;
  const duration = 6 + seed(index + 2, 100) * 6;
  const size = 2 + seed(index + 3, 100) * 2;
  const delay = seed(index + 4, 100) * 2;
  const opacity = 0.3 + seed(index + 5, 100) * 0.5;
  // Alternate direction
  const direction = index % 2 === 0 ? 1 : -1;

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
        x: Math.cos((startAngle * Math.PI) / 180) * orbitRadius,
        y: Math.sin((startAngle * Math.PI) / 180) * orbitRadius,
      }}
      animate={{
        opacity: [0, opacity, opacity, 0],
        x: [
          Math.cos((startAngle * Math.PI) / 180) * orbitRadius,
          Math.cos(((startAngle + 90 * direction) * Math.PI) / 180) * orbitRadius,
          Math.cos(((startAngle + 180 * direction) * Math.PI) / 180) * orbitRadius,
          Math.cos(((startAngle + 270 * direction) * Math.PI) / 180) * orbitRadius,
          Math.cos(((startAngle + 360 * direction) * Math.PI) / 180) * orbitRadius,
        ],
        y: [
          Math.sin((startAngle * Math.PI) / 180) * orbitRadius,
          Math.sin(((startAngle + 90 * direction) * Math.PI) / 180) * orbitRadius,
          Math.sin(((startAngle + 180 * direction) * Math.PI) / 180) * orbitRadius,
          Math.sin(((startAngle + 270 * direction) * Math.PI) / 180) * orbitRadius,
          Math.sin(((startAngle + 360 * direction) * Math.PI) / 180) * orbitRadius,
        ],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
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

/* ── Progress line — thin bar that fills smoothly ── */
function ProgressLine() {
  return (
    <div
      style={{
        width: 48,
        height: 2,
        borderRadius: 1,
        background: 'var(--ring-track-color)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <motion.div
        style={{
          height: '100%',
          borderRadius: 1,
          background: 'var(--progress-color)',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
        initial={{ width: '0%', x: 0 }}
        animate={{
          width: ['0%', '40%', '40%', '0%'],
          x: ['0%', '30%', '100%', '100%'],
        }}
        transition={{
          duration: 1.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
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

                  {/* Orbital ring — draws itself */}
                  <OrbitalRing />

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
                          fontSize: 28,
                          fontWeight: 600,
                          letterSpacing: '0.08em',
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

              {/* Progress line — appears after text */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 1 ? 1 : 0 }}
                transition={{ delay: phase >= 1 ? 0.35 : 0, duration: 0.4 }}
              >
                <ProgressLine />
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
