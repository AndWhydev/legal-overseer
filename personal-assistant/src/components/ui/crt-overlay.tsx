'use client'

/**
 * CRT Overlay — layered CSS effects for a retro terminal/film look.
 * Pure CSS, zero JS runtime cost. Stack on top of any content.
 *
 * Effects: vignette, scanlines, film grain (blue tint), glitch, dot matrix
 */

export function CrtOverlay({
  vignette = true,
  scanlines = true,
  grain = true,
  glitch = true,
  dotMatrix = false,
  className,
}: {
  vignette?: boolean
  scanlines?: boolean
  grain?: boolean
  glitch?: boolean
  dotMatrix?: boolean
  className?: string
}) {
  return (
    <div className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Inline keyframes */}
      <style>{`
        @keyframes crt-grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2%, -3%); }
          20% { transform: translate(3%, 1%); }
          30% { transform: translate(-1%, 2%); }
          40% { transform: translate(2%, -2%); }
          50% { transform: translate(-3%, 3%); }
          60% { transform: translate(1%, -1%); }
          70% { transform: translate(-2%, 2%); }
          80% { transform: translate(3%, -3%); }
          90% { transform: translate(-1%, 1%); }
        }

        @keyframes crt-glitch {
          0%, 93%, 100% {
            clip-path: none;
            transform: none;
            opacity: 1;
          }
          94% {
            clip-path: inset(20% 0 60% 0);
            transform: translateX(4px) skewX(-2deg);
            opacity: 0.8;
          }
          95% {
            clip-path: inset(50% 0 20% 0);
            transform: translateX(-3px) skewX(1deg);
            opacity: 0.9;
          }
          96% {
            clip-path: inset(10% 0 70% 0);
            transform: translateX(2px);
            opacity: 0.7;
          }
          97% {
            clip-path: none;
            transform: none;
            opacity: 1;
          }
        }

        @keyframes crt-flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.98; }
          75% { opacity: 0.96; }
        }
      `}</style>

      {/* Vignette — dark edges, bright center */}
      {vignette && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
            zIndex: 10,
          }}
        />
      )}

      {/* Scanlines — horizontal lines */}
      {scanlines && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `repeating-linear-gradient(
              to bottom,
              transparent 0px,
              transparent 2px,
              rgba(0, 0, 0, 0.15) 2px,
              rgba(0, 0, 0, 0.15) 4px
            )`,
            zIndex: 11,
          }}
        />
      )}

      {/* Film grain — blue-tinted noise overlay */}
      {grain && (
        <div
          style={{
            position: 'absolute',
            inset: '-50%',
            width: '200%',
            height: '200%',
            background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")`,
            backgroundSize: '128px 128px',
            mixBlendMode: 'overlay',
            opacity: 0.4,
            animation: 'crt-grain 0.5s steps(8) infinite',
            zIndex: 12,
          }}
        />
      )}

      {/* Blue color shift — subtle blue tint over everything */}
      {grain && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(100, 140, 255, 0.03)',
            mixBlendMode: 'screen',
            zIndex: 13,
          }}
        />
      )}

      {/* Glitch — occasional horizontal tear */}
      {glitch && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: 'crt-glitch 8s ease-in-out infinite',
            zIndex: 14,
          }}
        >
          {/* Chromatic aberration lines that appear during glitch */}
          <div
            style={{
              position: 'absolute',
              top: '30%',
              left: 0,
              right: 0,
              height: '2px',
              background: 'rgba(229, 229, 229, 0.1)',
              opacity: 0,
              animation: 'crt-flicker 8s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '65%',
              left: 0,
              right: 0,
              height: '1px',
              background: 'rgba(100, 140, 255, 0.08)',
              opacity: 0,
              animation: 'crt-flicker 6s ease-in-out infinite',
            }}
          />
        </div>
      )}

      {/* Dot matrix — makes it look like an LED/terminal display */}
      {dotMatrix && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 100%),
              repeating-linear-gradient(
                to right,
                transparent 0px,
                transparent 2px,
                rgba(0, 0, 0, 0.08) 2px,
                rgba(0, 0, 0, 0.08) 3px
              ),
              repeating-linear-gradient(
                to bottom,
                transparent 0px,
                transparent 2px,
                rgba(0, 0, 0, 0.08) 2px,
                rgba(0, 0, 0, 0.08) 3px
              )
            `,
            zIndex: 15,
          }}
        />
      )}
    </div>
  )
}
