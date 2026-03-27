"use client";

import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { BlurFade } from "@/components/ui/blur-fade";

const FOOTER_LINKS = {
  product: [
    { name: "Features", href: "/#features" },
    { name: "Pricing", href: "/pricing" },
    { name: "For Agencies", href: "/industries/agencies" },
    { name: "For Trades", href: "/industries/trades" },
    { name: "For Professional Services", href: "/industries/professional-services" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Case Study", href: "/case-studies/all-webbed-up" },
    { name: "Contact", href: "mailto:support@bitbit.chat" },
  ],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
  ],
};

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ name: string; href: string }>;
}) {
  return (
    <div>
      <h4 className="mb-5 text-[13px] font-medium uppercase tracking-wide text-foreground">
        {title}
      </h4>
      <ul className="m-0 list-none space-y-3 p-0">
        {links.map((link) => (
          <li key={link.name}>
            <Link
              href={link.href}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MarketingFooter() {
  return (
    <footer className="bg-background px-6 py-16">
      <Separator className="mb-16" />
      <div className="mx-auto max-w-6xl">
        <BlurFade delay={0.1} inView>
          <div className="mb-16 grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
            <FooterColumn title="Product" links={FOOTER_LINKS.product} />
            <FooterColumn title="Company" links={FOOTER_LINKS.company} />
            <FooterColumn title="Legal" links={FOOTER_LINKS.legal} />

            <div>
              <h4 className="mb-5 text-[13px] font-medium uppercase tracking-wide text-foreground">
                Stay Updated
              </h4>
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                Get updates on new features and tips for AI operations.
              </p>
            </div>
          </div>
        </BlurFade>

        <Separator className="mb-8" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="font-serif text-sm font-semibold text-foreground">
            BitBit
          </span>
          <p className="text-xs text-muted-foreground">
            &copy; 2026 BitBit. Built in Australia.
          </p>
        </div>
      </div>
    </footer>
  );
}
