"use client";

interface SlideProgressProps {
  total: number;
  current: number;
}

export function SlideProgress({ total, current }: SlideProgressProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-6 bg-zinc-900"
              : "w-1.5 bg-zinc-300"
          }`}
        />
      ))}
    </div>
  );
}
