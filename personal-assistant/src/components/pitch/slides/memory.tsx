"use client";

import { Slide } from "../slide";

export function MemorySlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        It remembers everything and keeps getting smarter
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Seven types of business knowledge. Confidence scoring that fades
        unconfirmed memories and strengthens corroborated ones. Pattern detection
        across contacts. Pricing intelligence across invoices. Ask "Why did we
        stop working with TechCorp?" and it reconstructs the full timeline.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
          <div className="text-sm font-medium text-zinc-400">ChatGPT</div>
          <div className="mt-2 text-zinc-600">Remembers what you said</div>
        </div>
        <div className="rounded-lg border border-zinc-900 bg-zinc-900 p-6">
          <div className="text-sm font-medium text-zinc-400">BitBit</div>
          <div className="mt-2 text-white">
            Understands how your business works
          </div>
        </div>
      </div>
    </Slide>
  );
}
