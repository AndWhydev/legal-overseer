import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BitBit for Trades & Services | BitBit",
  description:
    "AI operations for tradies. Invoice from the job site, automate follow-ups, and stop doing admin at 9pm. WhatsApp-first, voice-ready.",
  keywords: [
    "trades business automation",
    "tradie invoicing AI",
    "job site automation",
    "WhatsApp business assistant",
  ],
  openGraph: {
    title: "BitBit for Trades & Services",
    description:
      "AI operations for tradies. Invoice from the job site, automate follow-ups, and stop doing admin at 9pm.",
    url: "https://bitbit.chat/industries/trades",
  },
};

export default function TradesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
