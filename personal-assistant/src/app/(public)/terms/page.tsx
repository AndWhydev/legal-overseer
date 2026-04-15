import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | BitBit',
  description: 'BitBit Terms of Service — AI operations platform terms and conditions',
}

const EFFECTIVE_DATE = '1 March 2026'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Effective: {EFFECTIVE_DATE}</p>

        {/* ── LAWYER NOTE ─────────────────────────────────────────────────────────
            Sections marked [ADDED — BITBIT TEAM] were not in the original draft
            reviewed by counsel. All other sections are from the original lawyer-
            reviewed document. Please review all [ADDED] sections and advise on
            any amendments before these Terms are published.
        ──────────────────────────────────────────────────────────────────────── */}

        <Section title="1. Agreement">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the BitBit
            platform (&quot;Service&quot;), operated by BitBit Pty Ltd (ABN pending),
            a company registered under the laws of Queensland, Australia (&quot;we&quot;, &quot;us&quot;,
            &quot;our&quot;). By accessing or using the Service you agree to be bound by these Terms.
          </p>
        </Section>

        {/* [ADDED — BITBIT TEAM] Section 2 updated to reflect two-product architecture
            and broader market (was: "digital agencies" only) */}
        <AddedNote>
          Section 2 updated — original only covered &quot;digital agencies&quot;. BitBit now serves
          agencies, trades businesses, sole traders, and enterprise clients. Please confirm
          this broader description is appropriate.
        </AddedNote>
        <Section title="2. Service Description">
          <p>
            BitBit is a software-as-a-service platform that provides AI-powered operations
            automation and personal assistance. The Service is offered in two tiers:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Bit (Lite):</strong> A personal AI assistant for individuals, sole traders,
              and small operators, providing everyday task management, reminders, light business
              communications, and invoicing.
            </li>
            <li>
              <strong>BitBit (Full):</strong> A full business AI operating platform for agencies,
              businesses, and enterprise clients, including but not limited to: client
              communications, channel triage, revenue operations, proposal generation, lead
              management, tender discovery, and onboarding workflows.
            </li>
          </ul>
          <p className="mt-2">
            The specific features available to you depend on your subscription tier and the
            agent packages activated for your account.
          </p>
        </Section>

        <Section title="3. Accounts and Access">
          <p>
            You must provide accurate information when creating an account. You are responsible for
            maintaining the security of your account credentials. Each subscription is tied to an
            organisation (&quot;Org&quot;) and may include multiple users as permitted by your plan tier.
          </p>
        </Section>

        {/* [ADDED — BITBIT TEAM] Per-agent pricing model added to Section 4.
            Original only covered monthly subscriptions. Please confirm billing
            treatment for mid-cycle agent additions/removals. */}
        <AddedNote>
          Section 4 updated — per-agent package pricing model added. Original covered only
          monthly subscriptions. Please advise on proration treatment and whether mid-cycle
          agent changes need further clause detail.
        </AddedNote>
        <Section title="4. Subscription and Payment">
          <ul className="list-disc pl-5 space-y-1">
            <li>Subscriptions are billed monthly in advance via Stripe.</li>
            <li>Prices are in AUD unless otherwise stated and are exclusive of GST.</li>
            <li>We may change pricing with 30 days written notice.</li>
            <li>
              Failure to pay may result in suspension of access. We will provide 7 days notice
              before suspending an account for non-payment.
            </li>
            <li>
              The Service is priced on a per-agent package basis. Your subscription covers the
              specific agent packages activated for your account. Adding or removing agent
              packages mid-billing-cycle will be reflected in the following billing period unless
              otherwise agreed in writing.
            </li>
            <li>
              Free trial periods, where offered, automatically convert to paid subscriptions at
              the end of the trial unless cancelled before the trial period expires.
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

        {/* [ADDED — BITBIT TEAM] Section 6A is entirely new — covers autonomous agent
            actions, delegation mandate, and outbound communications on behalf of users.
            This is critical given BitBit's autonomous operation capabilities.
            Please review carefully. */}
        <AddedNote>
          Section 6A is entirely new — not in original draft. Covers autonomous actions,
          delegation/autopilot mode, and outbound communications liability. This is the
          most important new section given BitBit&apos;s autonomous operation model.
          Please review and advise.
        </AddedNote>
        <Section title="6A. Autonomous Agent Actions">
          <p>
            The Service includes autonomous AI agents that may take actions on your behalf,
            including but not limited to: sending emails, SMS messages, and WhatsApp messages;
            creating and sending invoices; booking calendar appointments; creating and assigning
            tasks; and submitting forms or content to connected third-party services
            (&quot;Autonomous Actions&quot;).
          </p>

          <h3 className="font-medium mt-4 mb-1">Authorisation</h3>
          <p>
            By enabling autonomous agent features and configuring autonomy settings within the
            Service, you expressly authorise BitBit to take Autonomous Actions on your behalf.
            You acknowledge that you remain solely responsible for all Autonomous Actions taken
            by the Service under your account, including their content, timing, and consequences.
          </p>

          <h3 className="font-medium mt-4 mb-1">Approval Queue</h3>
          <p>
            The Service includes a human approval queue (&quot;BitBit Gate&quot;) that routes certain
            Autonomous Actions for your review before execution. You may configure the level of
            autonomy granted to each agent. Where you elect to operate in &quot;Autopilot&quot; mode or
            activate a delegation mandate for a specific entity, you acknowledge that Autonomous
            Actions for that entity or domain may be executed without your prior approval.
          </p>

          <h3 className="font-medium mt-4 mb-1">Your Responsibility</h3>
          <p>
            You are responsible for: (a) configuring autonomy settings appropriately for your
            use case; (b) monitoring Autonomous Actions via the activity feed and audit trail;
            (c) the accuracy and legality of all content sent or submitted by the Service on
            your behalf; and (d) ensuring that Autonomous Actions comply with all applicable
            laws including the Spam Act 2003 (Cth) and equivalent legislation.
          </p>

          <h3 className="font-medium mt-4 mb-1">Limitation</h3>
          <p>
            We are not liable for any loss, damage, or claim arising from an Autonomous Action
            taken in accordance with your configured autonomy settings. Where an Autonomous
            Action is taken contrary to your configured settings due to a platform error, our
            liability is limited as set out in Section 9.
          </p>
        </Section>

        {/* [ADDED — BITBIT TEAM] Section 6B is entirely new — covers outbound
            communications, Spam Act compliance, and daily send limits.
            Please review. */}
        <AddedNote>
          Section 6B is entirely new — not in original draft. Covers outbound communications
          sent by BitBit on behalf of users, Spam Act 2003 compliance obligations, and
          platform-level daily send limits. Please review.
        </AddedNote>
        <Section title="6B. Outbound Communications">
          <p>
            The Service may send emails, SMS messages, and messages via third-party messaging
            platforms (including WhatsApp) on your behalf to your contacts and clients
            (&quot;Outbound Communications&quot;).
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              You warrant that you have a lawful basis to send each Outbound Communication and
              that all recipients have consented to receive commercial electronic messages from
              you where required by the Spam Act 2003 (Cth) or equivalent legislation.
            </li>
            <li>
              You must not use the Service to send unsolicited commercial messages, bulk
              marketing communications, or any content that violates applicable anti-spam,
              anti-harassment, or consumer protection laws.
            </li>
            <li>
              The Service enforces daily send limits per account to prevent abuse. These limits
              may be adjusted based on your subscription tier. Exceeding these limits may result
              in temporary suspension of outbound capabilities.
            </li>
            <li>
              All Outbound Communications are sent on your behalf and you remain the sender of
              record for all legal and compliance purposes.
            </li>
          </ul>
        </Section>

        {/* [ADDED — BITBIT TEAM] Section 6C is entirely new — covers third-party
            integrations, OAuth authorisation, and the user's responsibilities when
            connecting external services. Please review. */}
        <AddedNote>
          Section 6C is entirely new — not in original draft. Covers OAuth/integration
          authorisation, user responsibility for third-party account access, and BitBit&apos;s
          role as agent when acting within connected services. Please review.
        </AddedNote>
        <Section title="6C. Third-Party Integrations">
          <p>
            The Service allows you to connect third-party accounts and services including but
            not limited to Gmail, Outlook, WhatsApp, Xero, Asana, Slack, Google Calendar,
            Stripe, and others (&quot;Connected Services&quot;).
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              By connecting a third-party service, you warrant that you are authorised to grant
              BitBit access to that account and that doing so does not violate the terms of
              service of the third-party provider.
            </li>
            <li>
              When the Service takes actions within a Connected Service on your behalf, it acts
              as your agent. You remain responsible for all actions taken within your Connected
              Service accounts.
            </li>
            <li>
              We are not responsible for any loss of access to, or changes in functionality of,
              Connected Services caused by the third-party provider.
            </li>
            <li>
              You may disconnect any Connected Service at any time via your account settings.
              Disconnection does not delete historical data already processed by the Service.
            </li>
          </ul>
        </Section>

        {/* [ADDED — BITBIT TEAM] Section 6D is entirely new — covers third-party
            contact data (e.g. contacts whose messages BitBit ingests and profiles).
            This is significant legal exposure — please review carefully. */}
        <AddedNote>
          Section 6D is entirely new — not in original draft. Addresses the significant
          exposure where BitBit ingests and profiles third-party contacts (people who have
          not consented to the platform). User is made responsible for having a lawful
          basis. Please review carefully — this is a key privacy and liability issue.
        </AddedNote>
        <Section title="6D. Third-Party Contact Data">
          <p>
            The Service processes communications and builds knowledge profiles (&quot;Contact
            Profiles&quot;) about your clients, contacts, and other third parties (&quot;Contacts&quot;)
            from data ingested through your Connected Services and direct interactions.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              You warrant that you have a lawful basis under the Privacy Act 1988 (Cth)
              (and the GDPR where applicable) to provide and process your Contacts&apos; personal
              information through the Service.
            </li>
            <li>
              In processing your Contacts&apos; data, we act as a data processor on your instructions.
              You are the data controller for all Contact data processed through your account.
            </li>
            <li>
              You are responsible for ensuring that your use of Contact Profiles complies with
              applicable privacy laws, including providing appropriate notices to Contacts where
              required.
            </li>
            <li>
              Contact Profiles are retained for the duration of your subscription and deleted
              (subject to financial record retention requirements) within 30 days of account
              termination.
            </li>
          </ul>
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

        {/* [ADDED — BITBIT TEAM] Section 8 updated to address IP ownership of
            AI-generated content (proposals, invoices, ad scripts etc).
            Original did not address this. Please confirm. */}
        <AddedNote>
          Section 8 updated — added clause on IP ownership of AI-generated outputs.
          Original only covered BitBit&apos;s own IP. Please confirm the &quot;you own the outputs&quot;
          position is appropriate and consistent with Anthropic&apos;s terms.
        </AddedNote>
        <Section title="8. Intellectual Property">
          <p>
            All rights in the Service (excluding Your Data) remain with us. &quot;BitBit&quot; and
            associated logos are our trademarks. Nothing in these Terms grants you rights to use
            our trademarks without prior written consent.
          </p>
          <p className="mt-2">
            Content generated by the Service&apos;s AI agents using Your Data — including proposals,
            invoices, scripts, reports, and other outputs (&quot;Generated Content&quot;) — is owned by
            you, subject to: (a) the underlying AI model provider&apos;s terms of service; and
            (b) our right to use anonymised, aggregated data to improve the Service.
            We make no representations as to the originality or intellectual property status
            of Generated Content, and you are responsible for ensuring Generated Content does
            not infringe third-party rights before use.
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

        {/* [ADDED — BITBIT TEAM] Section 13A is entirely new — Force Majeure.
            Not in original draft. Standard commercial clause. Please confirm wording. */}
        <AddedNote>
          Section 13A is entirely new — not in original draft. Standard force majeure clause
          covering third-party provider outages (Anthropic, Supabase, Fly.io etc).
          Please confirm wording is appropriate.
        </AddedNote>
        <Section title="13A. Force Majeure">
          <p>
            We are not liable for any failure or delay in performing our obligations under these
            Terms where such failure or delay results from circumstances beyond our reasonable
            control, including but not limited to: acts of God, natural disasters, war,
            pandemic, government action, failure of third-party infrastructure or service
            providers (including AI model providers, cloud hosting providers, and payment
            processors), or internet outages. We will notify you as soon as reasonably
            practicable of any such event and will resume performance as soon as possible.
          </p>
        </Section>

        {/* [ADDED — BITBIT TEAM] Section 13B is entirely new — Beta and Pre-Release
            disclaimer. Important while BitBit is in beta. Please confirm. */}
        <AddedNote>
          Section 13B is entirely new — not in original draft. Beta / pre-release disclaimer.
          Important for managing user expectations and limiting liability during current
          beta phase. Should be removed or updated once out of beta. Please confirm.
        </AddedNote>
        <Section title="13B. Beta Services">
          <p>
            The Service or certain features within it may be made available on a beta or
            pre-release basis (&quot;Beta Features&quot;). Beta Features are provided for evaluation
            purposes and may be incomplete, contain errors, or change significantly before
            general availability. Beta Features are provided &quot;as-is&quot; without warranty of
            any kind. We may discontinue Beta Features at any time without notice. Your use
            of Beta Features is at your sole risk.
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
      <div className="text-sm leading-relaxed text-muted-foreground space-y-2">{children}</div>
    </section>
  )
}

function AddedNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
      <span className="font-semibold">⚑ ADDED BY BITBIT TEAM — FOR LAWYER REVIEW: </span>
      {children}
    </div>
  )
}
