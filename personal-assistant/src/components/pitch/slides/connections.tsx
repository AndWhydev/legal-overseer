"use client";

import { Slide } from "../slide";
import { VideoClip } from "../video-clip";

export function ConnectionsSlide() {
  return (
    <Slide>
      <h2 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
        It connects to everything you already use
      </h2>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
        200+ services through one screen. Email, WhatsApp, iMessage, Xero,
        Calendar, Slack, and hundreds more. Click to connect. Native bridges for
        WhatsApp and iMessage mean real two way messaging, not API wrappers.
        Voice notes get transcribed automatically. Say "invoice him" and it knows
        who you mean.
      </p>
      <div className="mt-8">
        <VideoClip
          src="/pitch/videos/connections-grid.mp4"
          alt="BitBit connections grid showing service tiles"
          className="w-full max-w-lg"
        />
      </div>
    </Slide>
  );
}
