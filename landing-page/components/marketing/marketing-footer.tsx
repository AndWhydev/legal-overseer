import Link from "next/link";

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
      <h4 className="mb-5 text-[13px] font-medium uppercase tracking-wide text-[#1a1a1a]">
        {title}
      </h4>
      <ul className="list-none p-0 m-0 space-y-3">
        {links.map((link) => (
          <li key={link.name}>
            <Link
              href={link.href}
              className="text-[13px] text-[#6b6560] transition-colors hover:text-[#1a1a1a]"
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
    <footer className="border-t border-[#e8e4dc] bg-[#faf9f0] px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn title="Product" links={FOOTER_LINKS.product} />
          <FooterColumn title="Company" links={FOOTER_LINKS.company} />
          <FooterColumn title="Legal" links={FOOTER_LINKS.legal} />

          <div>
            <h4 className="mb-5 text-[13px] font-medium uppercase tracking-wide text-[#1a1a1a]">
              Stay Updated
            </h4>
            <p className="mb-4 text-[13px] leading-relaxed text-[#6b6560]">
              Get updates on new features and tips for AI operations.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#e8e4dc] pt-8 sm:flex-row">
          <span
            className="text-sm font-semibold text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            BitBit
          </span>
          <p className="text-[12px] text-[#8b6f47]">
            &copy; 2026 BitBit. Built in Australia.
          </p>
        </div>
      </div>
    </footer>
  );
}
