"use client";

import { Slide } from "../slide";

const ICONS = [
  { name: "Gmail" },
  { name: "WhatsApp" },
  { name: "Xero" },
  { name: "Calendar" },
  { name: "Slack" },
  { name: "CRM" },
];

export function ProblemSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        You're doing two jobs
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        You started a business to do work you're good at. Instead you spend half
        your day switching between apps, chasing invoices, and forwarding
        messages to the right person. Every service is its own silo. Nobody
        connects them. Nobody remembers the context. So you do it yourself.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        {ICONS.map((icon) => (
          <div
            key={icon.name}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-500 opacity-60"
          >
            {icon.name}
          </div>
        ))}
      </div>
    </Slide>
  );
}
