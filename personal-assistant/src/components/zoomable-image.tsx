"use client"

import Zoom from "react-medium-image-zoom"
import "react-medium-image-zoom/dist/styles.css"
import "./zoomable-image.css"
import { ImageOff } from "lucide-react"
import { DetailedHTMLProps, ImgHTMLAttributes, useState } from "react"

export interface ZoomableImageProps
  extends DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> {
  /** Disable zoom behavior */
  disabled?: boolean
  /** Higher quality image src to load when zoomed */
  zoomSrc?: string
  /** Offset in pixels from window boundaries when zoomed */
  zoomMargin?: number
}

export default function ZoomableImage({
  src,
  alt,
  className,
  onLoad,
  onError,
  disabled = false,
  zoomSrc,
  zoomMargin = 16,
  ...rest
}: ZoomableImageProps) {
  const [hasError, setHasError] = useState(false)

  if (!src) return null

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setHasError(true)
    onError?.(e)
  }

  if (hasError) {
    return (
      <div className="aspect-square w-full h-24 flex items-center justify-center rounded-md">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageOff strokeWidth={1} className="w-8 h-8" />
        </div>
      </div>
    )
  }

  const image = (
    <img
      src={src}
      alt={alt || ""}
      className={className}
      onLoad={onLoad}
      onError={handleError}
      {...rest}
    />
  )

  if (disabled) {
    return image
  }

  return (
    <Zoom
      classDialog="zoomable-image-dialog"
      zoomMargin={zoomMargin}
      zoomImg={zoomSrc ? { src: zoomSrc } : undefined}
    >
      {image}
    </Zoom>
  )
}
