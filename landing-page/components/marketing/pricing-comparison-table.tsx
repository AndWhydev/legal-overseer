"use client";

import { Check, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BlurFade } from "@/components/ui/blur-fade";

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
      <span className="font-mono text-xs font-medium text-foreground">
        {value}
      </span>
    );
  }
  if (value === true) {
    return <Check size={16} className="text-[#FF5A1F]" />;
  }
  return <Minus size={14} className="text-muted-foreground/40" />;
}

export default function PricingComparisonTable() {
  return (
    <BlurFade delay={0.2} inView>
      <div className="mt-16">
        <h2 className="mb-8 text-center font-serif text-2xl font-semibold text-foreground">
          Compare all features
        </h2>

        <Card className="overflow-hidden p-0">
          <CardContent className="overflow-auto p-0">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[2] min-w-[180px] border-b border-border bg-secondary px-5 py-3.5 text-left text-sm font-medium text-muted-foreground">
                    Feature
                  </th>
                  {PLAN_NAMES.map((plan, i) => (
                    <th
                      key={plan}
                      className={`min-w-[90px] border-b border-border px-4 py-3.5 text-center text-sm ${
                        plan === "Growth"
                          ? "font-semibold text-[#FF5A1F]"
                          : "font-medium text-muted-foreground"
                      } ${i === 0 ? "border-l border-border" : ""}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        {plan}
                        {plan === "Growth" && (
                          <Badge className="bg-[#FF5A1F] text-[10px] hover:bg-[#FF5A1F]">
                            Popular
                          </Badge>
                        )}
                      </div>
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
                        className="sticky left-0 z-[1] border-b border-border bg-secondary px-5 pb-2 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {section.category}
                      </td>
                    </tr>

                    {section.rows.map((row, rowIdx) => (
                      <tr
                        key={row.name}
                        className={rowIdx % 2 === 0 ? "bg-card" : "bg-background"}
                      >
                        <td
                          className={`sticky left-0 z-[1] border-b border-border px-5 py-2.5 text-sm text-muted-foreground ${
                            rowIdx % 2 === 0 ? "bg-card" : "bg-background"
                          }`}
                        >
                          {row.name}
                        </td>
                        {PLAN_KEYS.map((key, i) => (
                          <td
                            key={key}
                            className={`border-b border-border px-4 py-2.5 text-center ${
                              i === 0 ? "border-l border-border" : ""
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
          </CardContent>
        </Card>
      </div>
    </BlurFade>
  );
}
