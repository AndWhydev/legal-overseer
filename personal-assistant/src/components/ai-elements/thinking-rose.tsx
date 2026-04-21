"use client";

import { cn } from "@/lib/utils";
import { forwardRef, memo, useEffect, useRef } from "react";

const PETAL_COUNT = 7;
const PARTICLE_COUNT = 32;
const ROTATION_PERIOD = 28;
const DETAIL_MIN = 0.52;
const DETAIL_MAX = 1.0;
const DETAIL_PERIOD = 4;
const SCALE = 3.9;
const R_MAJOR = 7.0;
const R_MINOR = 3.0;
const CENTER = 50;
const PATH_STEPS = 360;
const PARTICLE_BASE_OPACITY = 0.55;
const PATH_OPACITY = 0.08;
const STROKE_WIDTH = 0.8;
const PARTICLE_RADIUS = 1.0;

function detailScale(time: number): number {
  const t = (Math.sin(time * ((2 * Math.PI) / DETAIL_PERIOD)) + 1) / 2;
  return DETAIL_MIN + t * (DETAIL_MAX - DETAIL_MIN);
}

function roseX(t: number, s: number): number {
  return CENTER + (R_MAJOR * Math.cos(t) - R_MINOR * s * Math.cos(PETAL_COUNT * t)) * SCALE;
}

function roseY(t: number, s: number): number {
  return CENTER + (R_MAJOR * Math.sin(t) - R_MINOR * s * Math.sin(PETAL_COUNT * t)) * SCALE;
}

function buildPath(s: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= PATH_STEPS; i++) {
    const t = (i / PATH_STEPS) * 2 * Math.PI;
    parts.push(`${i === 0 ? "M" : "L"}${roseX(t, s).toFixed(2)},${roseY(t, s).toFixed(2)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

export interface ThinkingRoseProps {
  size?: number;
  className?: string;
}

const ThinkingRoseComponent = forwardRef<SVGSVGElement, ThinkingRoseProps>(
  ({ size = 48, className }, ref) => {
    const pathRef = useRef<SVGPathElement>(null);
    const groupRef = useRef<SVGGElement>(null);
    const particleRefs = useRef<(SVGCircleElement | null)[]>([]);
    const rafRef = useRef<number>(0);

    useEffect(() => {
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = (now - startTime) / 1000;
        const s = detailScale(elapsed);

        if (pathRef.current) {
          pathRef.current.setAttribute("d", buildPath(s));
        }

        if (groupRef.current) {
          const angle = (elapsed / ROTATION_PERIOD) * 360;
          groupRef.current.setAttribute("transform", `rotate(${angle.toFixed(2)}, ${CENTER}, ${CENTER})`);
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const circle = particleRefs.current[i];
          if (!circle) continue;
          const phase = ((i / PARTICLE_COUNT) * 2 * Math.PI + elapsed * 0.8) % (2 * Math.PI);
          const cx = roseX(phase, s);
          const cy = roseY(phase, s);
          const trail = ((elapsed * 0.8) / (2 * Math.PI)) % 1;
          const dist = ((i / PARTICLE_COUNT - trail + 1) % 1);
          const opacity = PARTICLE_BASE_OPACITY * (1 - dist * 0.85);
          circle.setAttribute("cx", cx.toFixed(2));
          circle.setAttribute("cy", cy.toFixed(2));
          circle.setAttribute("opacity", opacity.toFixed(3));
        }

        rafRef.current = requestAnimationFrame(animate);
      };

      rafRef.current = requestAnimationFrame(animate);
      return () => { cancelAnimationFrame(rafRef.current); };
    }, []);

    return (
      <svg
        ref={ref}
        aria-hidden="true"
        className={cn("shrink-0", className)}
        fill="none"
        height={size}
        viewBox="0 0 100 100"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g ref={groupRef}>
          <path
            ref={pathRef}
            d={buildPath(DETAIL_MIN)}
            fill="none"
            opacity={PATH_OPACITY}
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth={STROKE_WIDTH}
          />
          {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
            <circle
              key={i}
              ref={(el) => { particleRefs.current[i] = el; }}
              cx={CENTER}
              cy={CENTER}
              fill="currentColor"
              opacity={0}
              r={PARTICLE_RADIUS}
            />
          ))}
        </g>
      </svg>
    );
  }
);

ThinkingRoseComponent.displayName = "ThinkingRose";

export const ThinkingRose = memo(ThinkingRoseComponent);
