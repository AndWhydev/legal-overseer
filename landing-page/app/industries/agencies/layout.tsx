import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BitBit for Marketing Agencies | BitBit",
  description:
    "AI operations built for agencies. Automate proposals, triage client messages, manage invoices, and nurture leads -- all in one platform.",
  keywords: [
    "marketing agency automation",
    "agency AI operations",
    "digital agency AI assistant",
    "agency proposal automation",
  ],
  openGraph: {
    title: "BitBit for Marketing Agencies",
    description:
      "AI operations built for agencies. Automate proposals, triage client messages, manage invoices, and nurture leads.",
    url: "https://bitbit.chat/industries/agencies",
  },
};

export default function AgenciesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
