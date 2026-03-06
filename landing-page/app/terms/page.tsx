import { Metadata } from "next";
import { BlurFade } from "@/components/ui/blur-fade";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — BitBit",
  description: "BitBit's terms of service for using the platform.",
  openGraph: {
    title: "Terms of Service — BitBit",
    description: "Legal terms and conditions for using BitBit.",
    type: "website",
    url: "https://bitbit.chat/terms",
  },
};

function LegalNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#e8e4dc] bg-[#faf9f0]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="font-[var(--font-serif)] text-2xl font-semibold tracking-tight text-[#1a1a1a]" style={{ fontFamily: "var(--font-serif)" }}>
            BitBit
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] text-[#6b6560] md:flex">
          <Link href="/" className="transition-colors hover:text-[#1a1a1a]">Home</Link>
          <Link href="/about" className="transition-colors hover:text-[#1a1a1a]">About</Link>
          <Link href="/pricing" className="transition-colors hover:text-[#1a1a1a]">Pricing</Link>
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

function TermsContent() {
  return (
    <div className="mx-auto max-w-3xl">
      <BlurFade delay={0.1} inView>
        <h1
          className="mb-2 mt-24 text-4xl font-semibold text-[#1a1a1a]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Terms of Service
        </h1>
        <p className="mb-12 text-[13px] text-[#8b6f47]">
          Last updated: March 6, 2026
        </p>
      </BlurFade>

      <div className="prose prose-invert max-w-none space-y-8 text-[15px] text-[#6b6560]">
        <BlurFade delay={0.15} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              1. Agreement to Terms
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) apply to your use of BitBit and constitute a legal agreement between you and BitBit Inc. By accessing or using BitBit, you agree to be bound by these Terms. If you do not agree to any part of these terms, you may not use the service.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              2. Use License
            </h2>
            <p>
              We grant you a limited, non-exclusive, non-transferable license to use BitBit for your personal or business use in accordance with these Terms. You agree not to:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>Modify or copy the materials</li>
              <li>Use the materials for any commercial purpose or for any public display</li>
              <li>Attempt to decompile or reverse engineer any software contained on BitBit</li>
              <li>Remove any copyright or other proprietary notations from the materials</li>
              <li>Transfer the materials to another person or &quot;mirror&quot; the materials on any other server</li>
            </ul>
          </section>
        </BlurFade>

        <BlurFade delay={0.25} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              3. Disclaimer
            </h2>
            <p>
              The materials on BitBit are provided on an &apos;as is&apos; basis. BitBit makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.3} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              4. Limitations
            </h2>
            <p>
              In no event shall BitBit or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on BitBit, even if BitBit or an authorized representative has been notified orally or in writing of the possibility of such damage.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.35} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              5. Accuracy of Materials
            </h2>
            <p>
              The materials appearing on BitBit could include technical, typographical, or photographic errors. BitBit does not warrant that any of the materials on its website are accurate, complete, or current. BitBit may make changes to the materials contained on its website at any time without notice.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.4} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              6. Links
            </h2>
            <p>
              BitBit has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by BitBit of the site. Use of any such linked website is at the user&apos;s own risk.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.45} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              7. Modifications
            </h2>
            <p>
              BitBit may revise these terms of service for its website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.5} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              8. User Accounts
            </h2>
            <p>
              If you create an account on BitBit, you are responsible for maintaining the confidentiality of your account information and password and for restricting access to your computer. You agree to accept responsibility for all activities that occur under your account or password. You must notify BitBit immediately of any unauthorized uses of your account.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.55} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              9. Acceptable Use
            </h2>
            <p>
              You agree not to use BitBit for any unlawful purposes or in any way that could damage, disable, or impair the service. You agree not to use BitBit to transmit any harmful, threatening, abusive, defamatory, obscene, or otherwise objectionable material.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.6} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              10. Termination
            </h2>
            <p>
              BitBit may terminate or suspend your account and access to the service at any time, for any reason, with or without notice, including if you violate these Terms.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.65} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              11. Contact Information
            </h2>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="mt-4">
              Email: legal@bitbit.chat<br />
              Address: BitBit Inc., San Francisco, CA
            </p>
          </section>
        </BlurFade>
      </div>
    </div>
  );
}

function LegalFooter() {
  return (
    <footer className="border-t border-[#e8e4dc] py-12 px-6 mt-20">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <span className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: "var(--font-serif)" }}>
          BitBit
        </span>

        <div className="flex items-center gap-6 text-[13px] text-[#6b6560]">
          <Link href="/" className="transition-colors hover:text-[#1a1a1a]">Home</Link>
          <Link href="/about" className="transition-colors hover:text-[#1a1a1a]">About</Link>
          <Link href="/pricing" className="transition-colors hover:text-[#1a1a1a]">Pricing</Link>
          <a href="/privacy" className="transition-colors hover:text-[#1a1a1a]">Privacy</a>
          <a href="/terms" className="transition-colors hover:text-[#1a1a1a]">Terms</a>
        </div>

        <p className="text-[12px] text-[#8b6f47]">
          &copy; 2026 BitBit
        </p>
      </div>
    </footer>
  );
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#faf9f0]">
      <LegalNav />
      <section className="px-6 py-20">
        <TermsContent />
      </section>
      <LegalFooter />
    </main>
  );
}
