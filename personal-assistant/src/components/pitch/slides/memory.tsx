"use client";

import { Slide } from "../slide";

export function MemorySlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        It remembers everything and keeps getting smarter
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        BitBit's Memory Palace stores seven types of business knowledge:
        conversations, decisions, patterns, facts, relationships, pricing
        history, and learned conventions. It scores confidence on everything it
        learns. Memories that aren't confirmed fade over time. Ones that get
        corroborated grow stronger.
      </p>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Ask "Why did we stop working with TechCorp?" and it reconstructs the
        full timeline. Ask "What did we charge for the last 3 WordPress builds?"
        and it cross references invoices with contacts. It also watches your
        margins. If it notices scope creep that wasn't invoiced, it tells you
        before doing more work for that client.
      </p>
      <div className="mt-10 grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
          <div className="text-sm font-medium text-zinc-400">ChatGPT</div>
          <div className="mt-2 text-zinc-600">Remembers what you said</div>
        </div>
        <div className="rounded-lg border border-zinc-900 bg-white p-6">
          <div className="text-sm font-medium text-zinc-900">BitBit</div>
          <div className="mt-2 text-zinc-600">
            Understands how your business works
          </div>
        </div>
      </div>
    </Slide>
  );
}
