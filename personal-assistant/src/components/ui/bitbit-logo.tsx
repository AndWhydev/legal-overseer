import Image from 'next/image'

interface BitBitLogoProps {
  size?: number
  className?: string
}

export function BitBitLogo({ size = 32, className }: BitBitLogoProps) {
  return (
    <Image
      src="/bitbit-logo.svg"
      alt="BitBit"
      width={size}
      height={size}
      className={className}
      priority
    />
  )
}
