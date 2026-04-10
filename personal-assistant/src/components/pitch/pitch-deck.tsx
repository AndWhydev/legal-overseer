"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { SlideProgress } from "./slide-progress";

import { CoverSlide } from "./slides/cover";
import { ProblemSlide } from "./slides/problem";
import { WhyNowSlide } from "./slides/why-now";
import { MeetBitbitSlide } from "./slides/meet-bitbit";
import { ConnectionsSlide } from "./slides/connections";
import { MemorySlide } from "./slides/memory";
import { TrustLevelsSlide } from "./slides/trust-levels";
import { TeamSlide } from "./slides/team";
import { TractionSlide } from "./slides/traction";
import { BusinessModelSlide } from "./slides/business-model";
import { MarketSlide } from "./slides/market";
import { CompetitionSlide } from "./slides/competition";
import { NextStepsSlide } from "./slides/next-steps";

const SLIDES = [
  CoverSlide,
  ProblemSlide,
  WhyNowSlide,
  MeetBitbitSlide,
  ConnectionsSlide,
  MemorySlide,
  TrustLevelsSlide,
  TeamSlide,
  TractionSlide,
  BusinessModelSlide,
  MarketSlide,
  CompetitionSlide,
  NextStepsSlide,
];

export function PitchDeck() {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }, []);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const CurrentSlide = SLIDES[index];

  return (
    <div className="relative overflow-hidden" onClick={next}>
      <AnimatePresence mode="wait">
        <CurrentSlide key={index} />
      </AnimatePresence>
      <SlideProgress total={SLIDES.length} current={index} />
    </div>
  );
}
