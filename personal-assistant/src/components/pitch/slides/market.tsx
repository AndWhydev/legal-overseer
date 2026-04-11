"use client";

import { Slide } from "../slide";
import { StatBlock } from "../stat-block";

export function MarketSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        The market exists and it's paying
      </h2>
      <div className="mt-12 grid grid-cols-3 gap-8">
        <StatBlock
          value="$79.8B"
          label="Global SMB software market, 2026"
          source="Business Research Insights"
        />
        <StatBlock
          value="99%"
          label="of all businesses globally are SMBs"
          source="OECD"
        />
        <StatBlock
          value="7.4%"
          label="CAGR through 2035"
          source="BRI, March 2026"
        />
      </div>
      <div className="mt-10">
        <div className="text-sm font-medium text-zinc-400">
          Others are already proving willingness to pay
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-600">
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Sintra: 40,000+ users, $39 to $197/mo
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Hynge: 2,374 users, $59 to $149/mo
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Ambiguous: a16z backed
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            ai.work: $10M seed
          </span>
          <span className="rounded-full border border-zinc-200 px-3 py-1">
            Maisa: $30M seed
          </span>
        </div>
      </div>
    </Slide>
  );
}
