"use client";

import { Slide } from "../slide";
import { VideoClip } from "../video-clip";

export function MeetBitbitSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        BitBit handles your business while you do your work
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        Every user gets their own BitBit. It reads your messages, manages your
        invoices, triages your communications, follows up with your clients. It
        knows who Dave is, that he owes you money, and that he mentioned Steve's
        project last Tuesday. You can message it from WhatsApp while you're on a
        job site. You can ignore it and let it handle things. It tells you what
        it did, not what it's about to do.
      </p>
      <p className="mt-4 text-xl font-medium text-zinc-900">
        A COO costs $200k a year. BitBit costs $99 a month.
      </p>
      <div className="mt-8">
        <VideoClip
          src="/pitch/videos/chat-demo.mp4"
          alt="BitBit chat interface responding in real time"
          className="w-full max-w-lg"
        />
      </div>
    </Slide>
  );
}
