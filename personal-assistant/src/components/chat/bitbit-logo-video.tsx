'use client'

type LogoVariant = 'idle' | 'pulse'

const VARIANT_SRC: Record<LogoVariant, string> = {
  idle: '/bitbit-idle.apng',
  pulse: '/bitbit-pulse.apng',
}

interface BitBitLogoVideoProps {
  size?: number
  variant?: LogoVariant
}

export function BitBitLogoVideo({ size = 140, variant = 'idle' }: BitBitLogoVideoProps) {
  const frameSize = size * 1.85

  return (
    <div
      className="bb-chat__logo-wrap"
      style={{ width: frameSize, height: frameSize }}
    >
      <div
        className="bb-chat__logo-video"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={VARIANT_SRC[variant]}
          alt="BitBit"
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>
    </div>
  )
}
