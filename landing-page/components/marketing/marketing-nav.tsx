"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function MarketingNav({ active }: { active?: string }) {
  const links = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/pricing", label: "Pricing" },
    { href: "/case-studies/all-webbed-up", label: "Case Study" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            BitBit
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] text-muted-foreground md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "transition-colors hover:text-foreground",
                active === link.label && "font-medium text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button asChild size="sm" className="bb-orange-fill-noise bg-[#FF5A1F] text-white hover:bg-[#E44E17]">
            <Link href="https://app.bitbit.chat/login">
              Get started
            </Link>
          </Button>
        </div>
      </div>
      <Separator />
    </nav>
  );
}
