"use client";

import { Slide } from "../slide";

export function NextStepsSlide() {
  return (
    <Slide className="items-center justify-center text-center">
      <div className="flex flex-col items-center gap-8">
        <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
          What we're looking for
        </h2>
        <div className="max-w-lg text-left">
          <ul className="flex flex-col gap-4 text-lg text-zinc-600">
            <li>First engineering hire to reduce bus factor</li>
            <li>
              Beta program: 5 to 10 agencies from Andy's network
            </li>
            <li>Infrastructure scale: bridge ops and compute</li>
          </ul>
        </div>
        <div className="mt-8">
          <img
            src="/pitch/bitbit-logo.svg"
            alt="BitBit"
            className="h-10 w-auto opacity-30"
          />
        </div>
        <p className="text-sm text-zinc-400">bitbit.chat</p>
      </div>
    </Slide>
  );
}
