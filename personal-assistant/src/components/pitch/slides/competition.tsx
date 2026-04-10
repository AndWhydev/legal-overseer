"use client";

import { Slide } from "../slide";
import { ComparisonTable } from "../comparison-table";

export function CompetitionSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        Others are building chat interfaces. We built autonomous infrastructure.
      </h2>
      <div className="mt-10">
        <ComparisonTable />
      </div>
      <p className="mt-8 text-center text-xl font-medium text-zinc-900">
        They draft. BitBit does.
      </p>
    </Slide>
  );
}
