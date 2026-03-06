import { Metadata } from "next";
import { BlurFade } from "@/components/ui/blur-fade";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — BitBit",
  description: "BitBit's privacy policy explaining how we handle your data.",
  openGraph: {
    title: "Privacy Policy — BitBit",
    description: "How BitBit protects your privacy and data.",
    type: "website",
    url: "https://bitbit.chat/privacy",
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

function PrivacyContent() {
  return (
    <div className="mx-auto max-w-3xl">
      <BlurFade delay={0.1} inView>
        <h1
          className="mb-2 mt-24 text-4xl font-semibold text-[#1a1a1a]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Privacy Policy
        </h1>
        <p className="mb-12 text-[13px] text-[#8b6f47]">
          Last updated: March 6, 2026
        </p>
      </BlurFade>

      <div className="prose prose-invert max-w-none space-y-8 text-[15px] text-[#6b6560]">
        <BlurFade delay={0.15} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              Introduction
            </h2>
            <p>
              BitBit (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the BitBit service. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our service and the choices you have associated with that data.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              Information Collection and Use
            </h2>
            <p>
              We collect several different types of information for various purposes to provide and improve our service to you.
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li><strong>Account Information:</strong> Name, email address, and other details you provide when creating your account.</li>
              <li><strong>Connection Data:</strong> When you connect integrations (email, calendar, messages), we store necessary credentials and sync data.</li>
              <li><strong>Usage Data:</strong> Information about how you interact with the service, including agent runs, automations, and feature usage.</li>
              <li><strong>Communication Data:</strong> Messages, emails, and other content processed by BitBit to provide our service.</li>
            </ul>
          </section>
        </BlurFade>

        <BlurFade delay={0.25} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              Data Security
            </h2>
            <p>
              The security of your data is important to us but remember that no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your personal data, we cannot guarantee its absolute security.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.3} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              Data Retention
            </h2>
            <p>
              We retain your personal data for as long as your account is active and as needed to provide our services. You have the right to request deletion of your data at any time by contacting us.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.35} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              Your Rights
            </h2>
            <p>
              Depending on your location, you may have certain rights regarding your personal data, including:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>The right to access your personal data</li>
              <li>The right to correct inaccurate data</li>
              <li>The right to delete your data</li>
              <li>The right to restrict processing</li>
              <li>The right to data portability</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, please contact us at privacy@bitbit.chat.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.4} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              Changes to This Privacy Policy
            </h2>
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>
        </BlurFade>

        <BlurFade delay={0.45} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="mt-4">
              Email: privacy@bitbit.chat<br />
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

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#faf9f0]">
      <LegalNav />
      <section className="px-6 py-20">
        <PrivacyContent />
      </section>
      <LegalFooter />
    </main>
  );
}
