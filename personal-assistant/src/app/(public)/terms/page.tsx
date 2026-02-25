import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | BitBit',
  description: 'BitBit Terms of Service — AI operations platform terms and conditions',
}

const EFFECTIVE_DATE = '1 March 2026'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Effective: {EFFECTIVE_DATE}</p>

        <Section title="1. Agreement">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the BitBit
            platform (&quot;Service&quot;), operated by BitBit Pty Ltd (ABN pending),
            a company registered under the laws of Queensland, Australia (&quot;we&quot;, &quot;us&quot;,
            &quot;our&quot;). By accessing or using the Service you agree to be bound by these Terms.
          </p>
        </Section>

        <Section title="2. Service Description">
          <p>
            BitBit is a software-as-a-service platform that provides AI-powered operations
            automation for digital agencies, including but not limited to: client communications,
            channel triage, revenue operations, proposal generation, and onboarding workflows.
          </p>
        </Section>

        <Section title="3. Accounts and Access">
          <p>
            You must provide accurate information when creating an account. You are responsible for
            maintaining the security of your account credentials. Each subscription is tied to an
            organisation (&quot;Org&quot;) and may include multiple users as permitted by your plan tier.
          </p>
        </Section>

        <Section title="4. Subscription and Payment">
          <ul className="list-disc pl-5 space-y-1">
            <li>Subscriptions are billed monthly in advance via Stripe.</li>
            <li>Prices are in AUD unless otherwise stated and are exclusive of GST.</li>
            <li>We may change pricing with 30 days written notice.</li>
            <li>
              Failure to pay may result in suspension of access. We will provide 7 days notice
              before suspending an account for non-payment.
            </li>
          </ul>
        </Section>

        <Section title="5. Your Data">
          <ul className="list-disc pl-5 space-y-1">
            <li>You retain ownership of all data you upload to the Service (&quot;Your Data&quot;).</li>
            <li>
              You grant us a limited licence to process Your Data solely for the purpose of
              providing the Service, including processing by third-party AI models (Anthropic Claude).
            </li>
            <li>
              We store Your Data in Supabase infrastructure located in the ap-southeast-2
              (Sydney) region. See our Privacy Policy for details.
            </li>
            <li>
              On termination, you may export Your Data within 30 days. After that period we may
              delete it.
            </li>
          </ul>
        </Section>

        <Section title="6. AI Processing">
          <p>
            The Service uses large language models to generate content, classify messages, and
            automate workflows. AI outputs are provided &quot;as-is&quot; and may contain errors.
            You are responsible for reviewing AI-generated content before acting on it. We do
            not guarantee the accuracy, completeness, or suitability of AI outputs.
          </p>
        </Section>

        <Section title="7. Acceptable Use">
          <p>You must not:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Use the Service for any unlawful purpose.</li>
            <li>Attempt to reverse-engineer, decompile, or extract source code.</li>
            <li>Transmit malware, spam, or content that infringes third-party rights.</li>
            <li>Exceed the usage limits of your subscription tier.</li>
            <li>Share account credentials with unauthorised parties.</li>
          </ul>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            All rights in the Service (excluding Your Data) remain with us. &quot;BitBit&quot; and
            associated logos are our trademarks. Nothing in these Terms grants you rights to use
            our trademarks without prior written consent.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by the Australian Consumer Law (Schedule 2 of the
            Competition and Consumer Act 2010 (Cth)), our total liability for any claim arising
            from the Service is limited to the fees paid by you in the 12 months preceding the
            claim. We are not liable for indirect, incidental, special, or consequential damages.
          </p>
        </Section>

        <Section title="10. Indemnification">
          <p>
            You agree to indemnify and hold us harmless from claims arising from your use of the
            Service, your breach of these Terms, or your violation of any applicable law.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            Either party may terminate a subscription with 30 days written notice. We may
            immediately suspend access if you breach these Terms. Upon termination, your right
            to use the Service ceases and the data export period in Section 5 applies.
          </p>
        </Section>

        <Section title="12. Governing Law">
          <p>
            These Terms are governed by the laws of Queensland, Australia. Any disputes shall be
            submitted to the exclusive jurisdiction of the courts of Queensland.
          </p>
        </Section>

        <Section title="13. Changes to Terms">
          <p>
            We may update these Terms from time to time. We will notify you via email or in-app
            notification at least 14 days before changes take effect. Continued use of the
            Service after changes constitutes acceptance.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            For questions about these Terms, contact us at{' '}
            <a href="mailto:legal@bitbit.au" className="text-blue-600 underline">
              legal@bitbit.au
            </a>.
          </p>
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-700 space-y-2">{children}</div>
    </section>
  )
}
