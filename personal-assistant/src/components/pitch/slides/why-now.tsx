"use client";

import { Slide } from "../slide";
import { StatBlock } from "../stat-block";

export function WhyNowSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        December 2025 changed everything
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        AI agents crossed a reliability threshold in late 2025. The technology is
        ready. The question is who builds the right product.
      </p>
      <div className="mt-12 grid grid-cols-3 gap-8">
        <StatBlock
          value="57%"
          label="of small businesses now use AI"
          source="US Census BTOS, 2026"
        />
        <StatBlock
          value="80%"
          label="report measurable returns from agents"
          source="Anthropic/Material, 2026"
        />
        <StatBlock
          value="36% to 57%"
          label="adoption growth in 3 years"
          source="US Census BTOS"
        />
      </div>
    </Slide>
  );
}
