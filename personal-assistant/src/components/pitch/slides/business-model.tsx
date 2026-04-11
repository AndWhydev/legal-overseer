"use client";

import { Slide } from "../slide";

const TIERS = [
  { name: "Trades", agents: "4 agents", price: "$99/mo", width: "w-1/4" },
  { name: "Agency", agents: "10 agents", price: "$499/mo", width: "w-2/3" },
  {
    name: "Enterprise",
    agents: "Tender Hunter",
    price: "$1,000 to $2,000/mo",
    width: "w-full",
  },
];

export function BusinessModelSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        Per agent pricing. Agency network distribution.
      </h2>
      <div className="mt-10 flex flex-col gap-4">
        {TIERS.map((tier) => (
          <div key={tier.name} className="flex items-center gap-4">
            <div className="w-24 text-right text-sm font-medium text-zinc-900">
              {tier.name}
            </div>
            <div className="h-10 flex-1 rounded bg-zinc-50">
              <div
                className={`flex h-full items-center rounded bg-zinc-900 px-4 text-sm text-white ${tier.width}`}
              >
                {tier.agents} / {tier.price}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 p-6">
          <div className="text-sm font-medium text-zinc-400">Gross margin</div>
          <div className="mt-2 text-zinc-600">
            ~70% on agency tier. Compute ~$150/mo vs $499/mo revenue. Living
            Brain v2 targets 90%+ at scale.
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-6">
          <div className="text-sm font-medium text-zinc-400">Distribution</div>
          <div className="mt-2 text-zinc-600">
            Andy's agency network. Agencies sell to agencies. First 10 from
            direct outreach. Every deployment is a reference.
          </div>
        </div>
      </div>
    </Slide>
  );
}
