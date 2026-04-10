import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BitBit | Meet your new COO",
  description: "BitBit handles your business while you do your work.",
};

export default function PitchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-200">
      {children}
    </div>
  );
}
