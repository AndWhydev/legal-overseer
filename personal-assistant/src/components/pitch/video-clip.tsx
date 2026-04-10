"use client";

interface VideoClipProps {
  src: string;
  alt: string;
  className?: string;
}

export function VideoClip({ src, alt, className = "" }: VideoClipProps) {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-label={alt}
      className={`rounded-lg border border-zinc-200 shadow-sm ${className}`}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
