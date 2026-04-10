"use client";

import { Slide } from "../slide";

export function CoverSlide() {
  return (
    <Slide className="items-center justify-center text-center">
      <div className="flex flex-col items-center gap-8">
        <img
          src="/pitch/bitbit-logo.svg"
          alt="BitBit"
          className="h-16 w-auto"
        />
        <h1 className="font-serif text-5xl font-bold tracking-tight text-zinc-900 md:text-7xl">
          Meet your new COO
        </h1>
        <p className="text-sm tracking-widest text-zinc-400 uppercase">
          bitbit.chat
        </p>
      </div>
    </Slide>
  );
}
