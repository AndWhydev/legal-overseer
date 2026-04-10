"use client";

import { Slide } from "../slide";

export function TeamSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        One who can build it. One who can sell it.
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-8">
          <div className="text-lg font-semibold text-zinc-900">Torrin</div>
          <div className="mt-1 text-sm text-zinc-500">Technical founder</div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            Solo built the full stack. Agent engine with confidence routing
            validated against 65 real and adversarial scenarios with no false
            positives in production. Multi channel bridge architecture with per
            user WhatsApp and iMessage instances. Memory Palace with seven
            knowledge types and confidence decay. 120+ migrations, 2,072 tests,
            10 agent packages.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-8">
          <div className="text-lg font-semibold text-zinc-900">Andy</div>
          <div className="mt-1 text-sm text-zinc-500">
            Operations and distribution
          </div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            Runs All Webbed Up, a marketing agency in AU. First deployment.
            Agency network across Australia as the distribution channel. Knows
            the customer because he is the customer.
          </p>
        </div>
      </div>
      <p className="mt-8 text-sm text-zinc-500">
        The architecture is documented, tested, and built to hand off. Hiring a
        second engineer is one of the first things funding unlocks.
      </p>
    </Slide>
  );
}
