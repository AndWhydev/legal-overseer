import { PixelWordmark } from '@/components/ui/pixel-heading-word'

export function BitBitHeader() {
  return (
    <div className="inline-flex items-center gap-2 mb-2 select-none">
      <span className="shrink-0">
        <img src="/bitbit-icon-mark-light.png" alt="" width={20} height={20} className="dark:hidden" aria-hidden />
        <img src="/bitbit-icon-mark.png" alt="" width={20} height={20} className="hidden dark:block" aria-hidden />
      </span>
      <PixelWordmark className="text-[20px] font-medium text-foreground" style={{ WebkitTextStroke: '0.6px currentColor' }}>
        BitBit
      </PixelWordmark>
    </div>
  )
}
