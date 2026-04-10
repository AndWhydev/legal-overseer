"use client";

import { Slide } from "../slide";

const ICONS = [
  { name: "Gmail", color: "bg-red-100 text-red-600" },
  { name: "WhatsApp", color: "bg-green-100 text-green-600" },
  { name: "Xero", color: "bg-blue-100 text-blue-600" },
  { name: "Calendar", color: "bg-amber-100 text-amber-600" },
  { name: "Slack", color: "bg-purple-100 text-purple-600" },
  { name: "CRM", color: "bg-zinc-100 text-zinc-600" },
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
            className={`rounded-lg px-4 py-2 text-sm font-medium opacity-60 ${icon.color}`}
          >
            {icon.name}
          </div>
        ))}
      </div>
    </Slide>
  );
}
