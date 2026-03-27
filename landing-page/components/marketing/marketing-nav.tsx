import Link from "next/link";

export default function MarketingNav({ active }: { active?: string }) {
  const links = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/pricing", label: "Pricing" },
    { href: "/case-studies/all-webbed-up", label: "Case Study" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#e8e4dc] bg-[#faf9f0]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="text-2xl font-semibold tracking-tight text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            BitBit
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] text-[#6b6560] md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors hover:text-[#1a1a1a] ${
                active === link.label ? "font-medium text-[#1a1a1a]" : ""
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="https://app.bitbit.chat/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#FF5A1F] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
