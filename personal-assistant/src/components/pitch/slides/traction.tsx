"use client";

import { Slide } from "../slide";
import { VideoClip } from "../video-clip";

export function TractionSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        Built for real operations, tested by real work
      </h2>
      <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">10</div>
          <div className="mt-1 text-sm text-zinc-500">agents deployed</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">5</div>
          <div className="mt-1 text-sm text-zinc-500">messaging channels</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">2,072</div>
          <div className="mt-1 text-sm text-zinc-500">tests passing</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-semibold text-zinc-900">120+</div>
          <div className="mt-1 text-sm text-zinc-500">database migrations</div>
        </div>
      </div>
      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Full agency workflow running at All Webbed Up. Multi channel messaging
        live across WhatsApp, iMessage, SMS, email, and Slack. Waitlist
        collecting signups at bitbit.chat.
      </p>
      <div className="mt-8">
        <VideoClip
          src="/pitch/videos/whatsapp-triage.mp4"
          alt="Real BitBit interaction showing WhatsApp triage"
          className="w-full max-w-lg"
        />
      </div>
    </Slide>
  );
}
