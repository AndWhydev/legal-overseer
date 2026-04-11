"use client";

import { Slide } from "../slide";

const LEVELS = [
  {
    name: "Observer",
    description: "Watches and tells you what it sees",
    fill: "w-1/4",
  },
  {
    name: "Co pilot",
    description: "Drafts and you approve",
    fill: "w-1/2",
  },
  {
    name: "Autopilot",
    description: "Acts and reports back",
    fill: "w-3/4",
  },
  {
    name: "Full delegation",
    description: '"Handle Steve for me"',
    fill: "w-full",
  },
];

export function TrustLevelsSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        You choose how much it does
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Three levels of trust, set per role. You can also delegate specific
        contacts entirely. Say "Handle Steve for me" and BitBit manages all
        communications, invoicing, and follow ups for Steve, then sends you a
        morning summary. Say "Stop" and it stops instantly.
      </p>
      <div className="mt-10 flex flex-col gap-4">
        {LEVELS.map((level) => (
          <div key={level.name} className="flex items-center gap-4">
            <div className="w-32 text-right text-sm font-medium text-zinc-900">
              {level.name}
            </div>
            <div className="h-3 flex-1 rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full bg-zinc-900 transition-all ${level.fill}`}
              />
            </div>
            <div className="w-48 text-sm text-zinc-500">
              {level.description}
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );
}
