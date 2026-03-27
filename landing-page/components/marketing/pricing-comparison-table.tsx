import { Check, Minus } from "lucide-react";

type CellValue = boolean | string;

interface FeatureRow {
  name: string;
  free: CellValue;
  starter: CellValue;
  growth: CellValue;
  scale: CellValue;
  enterprise: CellValue;
}

interface FeatureSection {
  category: string;
  rows: FeatureRow[];
}

const COMPARISON_DATA: FeatureSection[] = [
  {
    category: "Users & Channels",
    rows: [
      { name: "Users", free: "1", starter: "1", growth: "5", scale: "15", enterprise: "Unlimited" },
      { name: "Channel integrations", free: "1", starter: "3", growth: "All", scale: "All", enterprise: "All" },
      { name: "WhatsApp", free: false, starter: true, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: "Core Agents",
    rows: [
      { name: "Sentry (monitoring)", free: false, starter: true, growth: true, scale: true, enterprise: true },
      { name: "Lead Swarm (capture)", free: false, starter: true, growth: true, scale: true, enterprise: true },
      { name: "Invoice Flow (billing)", free: false, starter: true, growth: true, scale: true, enterprise: true },
      { name: "Channel Triage", free: false, starter: true, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: "Growth Tools",
    rows: [
      { name: "SEO Monitor", free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: "Ad Script Generator", free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: "Content Creator", free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: "Proposal Generation", free: false, starter: false, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: "Premium",
    rows: [
      { name: "Tender Hunter", free: false, starter: false, growth: false, scale: true, enterprise: true },
      { name: "Advanced Analytics & MRR", free: false, starter: false, growth: false, scale: true, enterprise: true },
      { name: "Custom voice profiles", free: false, starter: false, growth: false, scale: true, enterprise: true },
    ],
  },
  {
    category: "Support",
    rows: [
      { name: "Community", free: true, starter: true, growth: true, scale: true, enterprise: true },
      { name: "Priority support", free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: "Dedicated manager", free: false, starter: false, growth: false, scale: false, enterprise: true },
    ],
  },
  {
    category: "AI Tokens",
    rows: [
      { name: "Monthly tokens", free: "5k", starter: "50k", growth: "200k", scale: "500k", enterprise: "Unlimited" },
    ],
  },
];

const PLAN_NAMES = ["Free", "Starter", "Growth", "Scale", "Enterprise"] as const;
const PLAN_KEYS = ["free", "starter", "growth", "scale", "enterprise"] as const;

function CellContent({ value }: { value: CellValue }) {
  if (typeof value === "string") {
    return (
      <span
        className="text-[13px] font-medium text-[#1a1a1a]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </span>
    );
  }
  if (value === true) {
    return <Check size={16} className="text-[#FF5A1F]" />;
  }
  return <Minus size={14} className="text-[#d4cfc6]" />;
}

export default function PricingComparisonTable() {
  return (
    <div className="mt-16">
      <h2
        className="mb-8 text-center text-2xl font-semibold text-[#1a1a1a]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Compare all features
      </h2>

      <div className="overflow-auto rounded-lg border border-[#e8e4dc] bg-white">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-[2] min-w-[180px] border-b border-[#e8e4dc] bg-[#f5f3ea] px-5 py-3.5 text-left text-[14px] font-medium text-[#8b6f47]">
                Feature
              </th>
              {PLAN_NAMES.map((plan, i) => (
                <th
                  key={plan}
                  className={`min-w-[90px] border-b border-[#e8e4dc] px-4 py-3.5 text-center text-[14px] ${
                    plan === "Growth"
                      ? "font-semibold text-[#FF5A1F]"
                      : "font-medium text-[#6b6560]"
                  } ${i === 0 ? "border-l border-[#e8e4dc]" : ""}`}
                >
                  {plan}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {COMPARISON_DATA.map((section) => (
              <>
                <tr key={`cat-${section.category}`}>
                  <td
                    colSpan={6}
                    className="sticky left-0 z-[1] border-b border-[#e8e4dc] bg-[#f5f3ea] px-5 pb-2 pt-3 text-[13px] font-medium uppercase tracking-wide text-[#8b6f47]"
                  >
                    {section.category}
                  </td>
                </tr>

                {section.rows.map((row, rowIdx) => (
                  <tr
                    key={row.name}
                    className={rowIdx % 2 === 0 ? "bg-white" : "bg-[#faf9f0]"}
                  >
                    <td
                      className={`sticky left-0 z-[1] border-b border-[#e8e4dc] px-5 py-2.5 text-[14px] text-[#6b6560] ${
                        rowIdx % 2 === 0 ? "bg-white" : "bg-[#faf9f0]"
                      }`}
                    >
                      {row.name}
                    </td>
                    {PLAN_KEYS.map((key, i) => (
                      <td
                        key={key}
                        className={`border-b border-[#e8e4dc] px-4 py-2.5 text-center ${
                          i === 0 ? "border-l border-[#e8e4dc]" : ""
                        }`}
                      >
                        <div className="flex items-center justify-center">
                          <CellContent value={row[key]} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
