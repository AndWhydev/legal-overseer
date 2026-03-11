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
          Last updated: March 11, 2026
        </p>
      </BlurFade>

      <div className="prose prose-invert max-w-none space-y-10 text-[15px] leading-relaxed text-[#6b6560]">

        {/* ── 1. Introduction ─────────────────────────────────────────────── */}
        <BlurFade delay={0.15} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              1. Introduction
            </h2>
            <p>
              BitBit (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is an agentic AI operations platform operated by All Webbed Up, an Australian business (ABN to be confirmed), based in Australia. This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you access or use the BitBit platform at <strong>bitbit.chat</strong> and <strong>app.bitbit.chat</strong> (collectively, the &quot;Service&quot;).
            </p>
            <p className="mt-3">
              We are committed to complying with the <em>Australian Privacy Act 1988</em> (Cth), the Australian Privacy Principles (APPs), and — where applicable — the <em>General Data Protection Regulation</em> (EU GDPR). By using the Service, you acknowledge that you have read and understood this Privacy Policy.
            </p>
            <p className="mt-3">
              If you do not agree with this Privacy Policy, please do not use the Service.
            </p>
          </section>
        </BlurFade>

        {/* ── 2. Definitions ──────────────────────────────────────────────── */}
        <BlurFade delay={0.17} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              2. Definitions
            </h2>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li><strong>&quot;Personal Information&quot;</strong> means information or an opinion about an identified individual, or an individual who is reasonably identifiable, as defined in the Privacy Act 1988.</li>
              <li><strong>&quot;Connected Service&quot;</strong> means a third-party application or platform you authorise BitBit to access on your behalf (e.g. Gmail, Google Calendar, Slack, Xero).</li>
              <li><strong>&quot;Agent&quot;</strong> means an AI-powered automated process within BitBit that performs tasks on your behalf.</li>
              <li><strong>&quot;Organisation&quot;</strong> means a workspace within BitBit, which may be a personal workspace or a team/business workspace.</li>
              <li><strong>&quot;Context Baseplate&quot;</strong> means the compiled world model BitBit builds from your connected data to provide contextual AI assistance.</li>
            </ul>
          </section>
        </BlurFade>

        {/* ── 3. Information We Collect ────────────────────────────────────── */}
        <BlurFade delay={0.19} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              3. Information We Collect
            </h2>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              3.1 Account Information
            </h3>
            <p>When you create a BitBit account, we collect:</p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>Email address</li>
              <li>Name (if provided)</li>
              <li>Password (stored securely hashed via Supabase Auth — we never store plaintext passwords)</li>
              <li>Authentication tokens from OAuth sign-in providers (Google, Microsoft)</li>
            </ul>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              3.2 Connected Service Data
            </h3>
            <p>
              When you connect third-party services, we access and process data from those services according to the permissions (OAuth scopes) you grant. This includes:
            </p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>
                <strong>Gmail:</strong> Email metadata (sender, recipient, subject, date), email snippets, and email content. We request the following scopes: full Gmail access (<code>https://mail.google.com/</code>), read-only access (<code>gmail.readonly</code>), and send access (<code>gmail.send</code>). This enables BitBit to read your emails, draft responses, and send messages on your behalf when instructed.
              </li>
              <li>
                <strong>Google Calendar:</strong> Calendar event details including title, description, attendees, times, and location. Scopes: read-only calendar access (<code>calendar.readonly</code>) and event management (<code>calendar.events</code>). This enables BitBit to read your schedule and create or modify calendar events on your behalf.
              </li>
              <li>
                <strong>Google Analytics:</strong> Website analytics data. Scopes: analytics read access (<code>analytics.readonly</code>) and full analytics access (<code>analytics</code>). This enables BitBit to read and analyse your website performance data.
              </li>
              <li>
                <strong>Microsoft Outlook:</strong> Email metadata and content. Scopes: mail read (<code>Mail.Read</code>) and mail send (<code>Mail.Send</code>).
              </li>
              <li>
                <strong>Slack:</strong> Messages from configured channels and direct messages. Used to surface actionable information and enable agent-assisted responses.
              </li>
              <li>
                <strong>WhatsApp:</strong> Inbound and outbound messages via the Meta Cloud API and/or Baileys bridge. Message content, sender phone numbers, and timestamps.
              </li>
              <li>
                <strong>Instagram:</strong> Direct messages and conversation data from your Instagram Business account via the Meta Graph API.
              </li>
              <li>
                <strong>SMS (Telnyx):</strong> Inbound and outbound text messages, phone numbers, and timestamps.
              </li>
              <li>
                <strong>Xero:</strong> Accounting data including invoices, contacts, payments, and financial summaries. Used to enable invoice management and financial reporting agents.
              </li>
              <li>
                <strong>Asana:</strong> Task and project data to synchronise with BitBit&apos;s kanban board.
              </li>
              <li>
                <strong>Calendly:</strong> Calendar availability and meeting event data.
              </li>
            </ul>
            <p className="mt-3">
              OAuth access and refresh tokens for Connected Services are encrypted and stored securely in our database. We use PKCE (Proof Key for Code Exchange) where supported for enhanced OAuth security.
            </p>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              3.3 Content You Create in BitBit
            </h3>
            <p>
              We store content you create or that agents create on your behalf within the Service, including:
            </p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>Tasks, goals, and kanban board data</li>
              <li>Contacts and contact metadata</li>
              <li>Notes, memories, and knowledge base entries</li>
              <li>Activity logs and audit trails</li>
              <li>Agent configurations, policies, and voice profiles</li>
              <li>Reports and generated documents</li>
            </ul>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              3.4 Context Baseplate Data
            </h3>
            <p>
              To provide intelligent, context-aware assistance, BitBit builds a structured knowledge model (the &quot;Context Baseplate&quot;) from your connected data. This includes:
            </p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li><strong>Entity profiles:</strong> Compiled summaries of people, organisations, and projects you interact with, built from cross-referencing your emails, calendar events, tasks, and messages.</li>
              <li><strong>Relationship graphs:</strong> Connections between entities (e.g. which contacts are associated with which projects).</li>
              <li><strong>Semantic memories:</strong> Facts, patterns, and preferences learned from your interactions over time, stored with confidence scores.</li>
              <li><strong>Timeline events:</strong> A chronological record of significant interactions across your connected channels.</li>
              <li><strong>Cross-references:</strong> Links between mentions of the same entity across different channels and data sources.</li>
            </ul>
            <p className="mt-3">
              The Context Baseplate is organisation-scoped and is not shared across organisations. It is used solely to improve the relevance and accuracy of AI agent responses within your workspace.
            </p>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              3.5 Usage and Analytics Data
            </h3>
            <p>We collect information about how you use the Service, including:</p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>Onboarding funnel events (e.g. workspace creation, connection setup, completion)</li>
              <li>Feature usage patterns and agent interaction logs</li>
              <li>AI agent run metadata: model used, token counts, cost estimates, duration, number of tool calls, success/failure status</li>
              <li>Error reports and performance data (via Sentry — see Section 7)</li>
            </ul>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              3.6 Technical Data
            </h3>
            <p>When you access the Service, we automatically collect:</p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>IP address (used for rate limiting and security)</li>
              <li>Browser type and version</li>
              <li>Session cookies and authentication tokens (Supabase session management)</li>
              <li>Referrer URL</li>
            </ul>
            <p className="mt-3">
              We set a strict <code>Referrer-Policy: strict-origin-when-cross-origin</code> header to limit referrer data shared with third parties. We do not use advertising cookies or tracking pixels.
            </p>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              3.7 Payment Information
            </h3>
            <p>
              Payment processing is handled entirely by Stripe. We do not store credit card numbers, bank account details, or other financial payment instruments on our servers. Stripe provides us with limited information such as the last four digits of your card, billing email address, invoice amounts, and payment status. For more information, see{" "}
              <a href="https://stripe.com/privacy" className="text-[#FF5A1F] underline hover:text-[#E44E17]" target="_blank" rel="noopener noreferrer">
                Stripe&apos;s Privacy Policy
              </a>.
            </p>
          </section>
        </BlurFade>

        {/* ── 4. How We Use Your Information ──────────────────────────────── */}
        <BlurFade delay={0.21} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              4. How We Use Your Information
            </h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>
                <strong>Providing the Service:</strong> To operate BitBit, including running AI agents, managing tasks, syncing channels, sending notifications, and delivering the core functionality you request.
              </li>
              <li>
                <strong>AI Processing:</strong> Your messages, task context, entity profiles, and relevant Connected Service data are sent to Anthropic&apos;s Claude API to generate AI-powered responses, recommendations, and agent actions. See Section 6 for details on AI data processing.
              </li>
              <li>
                <strong>Building Context:</strong> To construct and maintain the Context Baseplate — entity profiles, relationship graphs, and semantic memories — so that AI agents can provide relevant, contextual assistance.
              </li>
              <li>
                <strong>Communications:</strong> To send you transactional emails (via Resend), notifications (via email, WhatsApp, or in-dashboard), daily digests, approval requests, and weekly reports. You can configure notification preferences within the Service.
              </li>
              <li>
                <strong>Security and Fraud Prevention:</strong> To protect the Service using rate limiting, CSRF protection, Content Security Policy headers, HSTS, webhook signature verification, and authentication.
              </li>
              <li>
                <strong>Error Monitoring:</strong> To identify and fix bugs and performance issues using Sentry error tracking.
              </li>
              <li>
                <strong>Improving the Service:</strong> To understand usage patterns, improve features, and develop new functionality.
              </li>
              <li>
                <strong>Billing:</strong> To process payments, track usage metering (agent runs, token consumption), and manage subscriptions via Stripe.
              </li>
              <li>
                <strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes.
              </li>
            </ul>
          </section>
        </BlurFade>

        {/* ── 5. Lawful Basis for Processing (GDPR) ──────────────────────── */}
        <BlurFade delay={0.23} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              5. Lawful Basis for Processing (GDPR)
            </h2>
            <p>
              For users in the European Economic Area (EEA), United Kingdom, or other jurisdictions where the GDPR applies, we process your personal data on the following lawful bases:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>
                <strong>Performance of a Contract (Art. 6(1)(b)):</strong> Processing necessary to provide the Service you have signed up for, including AI agent execution, data synchronisation, and notification delivery.
              </li>
              <li>
                <strong>Consent (Art. 6(1)(a)):</strong> Where you explicitly grant OAuth permissions to connect third-party services, you consent to our accessing and processing data from those services. You can revoke consent at any time by disconnecting the service.
              </li>
              <li>
                <strong>Legitimate Interests (Art. 6(1)(f)):</strong> For security measures (rate limiting, fraud prevention, error monitoring), service improvement, and analytics — balanced against your privacy rights.
              </li>
              <li>
                <strong>Legal Obligation (Art. 6(1)(c)):</strong> Where processing is necessary to comply with a legal obligation.
              </li>
            </ul>
          </section>
        </BlurFade>

        {/* ── 6. AI Data Processing ──────────────────────────────────────── */}
        <BlurFade delay={0.25} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              6. AI Data Processing
            </h2>
            <p>
              BitBit uses Anthropic&apos;s Claude AI models (including Claude Haiku, Claude Sonnet, and Claude Opus) to power its AI agents. When you interact with BitBit or when agents execute tasks on your behalf, the following data may be sent to Anthropic&apos;s API:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>Your messages and instructions to the AI</li>
              <li>A system prompt containing your current context: active tasks, contacts, calendar events, reminders, channel summaries, organisation policies, and voice profile</li>
              <li>Entity context from the Context Baseplate (relevant entity profiles and relationship data for entities mentioned in your message)</li>
              <li>Tool call results from agent actions (e.g. search results, task creation confirmations)</li>
            </ul>
            <p className="mt-3">
              <strong>Anthropic&apos;s data handling:</strong> As of our last review, Anthropic does not use data submitted via its API to train its models. For full details, see{" "}
              <a href="https://www.anthropic.com/privacy" className="text-[#FF5A1F] underline hover:text-[#E44E17]" target="_blank" rel="noopener noreferrer">
                Anthropic&apos;s Privacy Policy
              </a>{" "}
              and{" "}
              <a href="https://www.anthropic.com/api-data-usage" className="text-[#FF5A1F] underline hover:text-[#E44E17]" target="_blank" rel="noopener noreferrer">
                API Data Usage Policy
              </a>.
            </p>
            <p className="mt-3">
              We log AI agent runs (including token counts, cost estimates, duration, and success/failure status) for billing, cost management, and debugging. We do not persistently store the full content of AI model inputs or outputs beyond the immediate session, except where content is saved as part of your organisation data (e.g. agent-generated task descriptions, email drafts).
            </p>
          </section>
        </BlurFade>

        {/* ── 7. Third-Party Service Providers ────────────────────────────── */}
        <BlurFade delay={0.27} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              7. Third-Party Service Providers
            </h2>
            <p>
              We use the following third-party services to operate BitBit. Each processes data on our behalf and is subject to their own privacy policies:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-[#e8e4dc]">
                    <th className="py-2 pr-4 font-semibold text-[#1a1a1a]">Provider</th>
                    <th className="py-2 pr-4 font-semibold text-[#1a1a1a]">Purpose</th>
                    <th className="py-2 font-semibold text-[#1a1a1a]">Data Processed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e4dc]/50">
                  <tr>
                    <td className="py-2 pr-4">Supabase</td>
                    <td className="py-2 pr-4">Database, authentication, real-time subscriptions</td>
                    <td className="py-2">All application data, user accounts, session tokens</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Anthropic</td>
                    <td className="py-2 pr-4">AI model inference (Claude API)</td>
                    <td className="py-2">Messages, context, tool results (see Section 6)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Vercel</td>
                    <td className="py-2 pr-4">Application hosting and deployment</td>
                    <td className="py-2">HTTP requests, server-side rendering</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Fly.io</td>
                    <td className="py-2 pr-4">Background worker hosting (Sydney region)</td>
                    <td className="py-2">Agent execution, webhook processing</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Cloudflare</td>
                    <td className="py-2 pr-4">Edge cron jobs, rate limiting</td>
                    <td className="py-2">Scheduled task triggers</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Stripe</td>
                    <td className="py-2 pr-4">Payment processing and billing</td>
                    <td className="py-2">Payment details, invoices, subscription status</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Resend</td>
                    <td className="py-2 pr-4">Transactional email delivery</td>
                    <td className="py-2">Recipient email addresses, email content</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Telnyx</td>
                    <td className="py-2 pr-4">SMS messaging</td>
                    <td className="py-2">Phone numbers, message content</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Meta (WhatsApp/Instagram)</td>
                    <td className="py-2 pr-4">WhatsApp and Instagram messaging</td>
                    <td className="py-2">Message content, phone numbers, user IDs</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Sentry</td>
                    <td className="py-2 pr-4">Error tracking and performance monitoring</td>
                    <td className="py-2">Error stack traces, user ID, org ID, email (if set), request context</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </BlurFade>

        {/* ── 8. Google API Services — Limited Use Disclosure ─────────────── */}
        <BlurFade delay={0.29} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              8. Google API Services — Limited Use Disclosure
            </h2>
            <p>
              BitBit&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-[#FF5A1F] underline hover:text-[#E44E17]" target="_blank" rel="noopener noreferrer">
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              8.1 What Google Data We Access
            </h3>
            <p>BitBit requests access to the following Google API scopes, each for a specific purpose:</p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>
                <strong>Gmail API</strong> (<code>https://mail.google.com/</code>, <code>gmail.readonly</code>, <code>gmail.send</code>): To read your emails, surface actionable messages to AI agents, draft and send emails on your behalf when you instruct BitBit to do so.
              </li>
              <li>
                <strong>Google Calendar API</strong> (<code>calendar.readonly</code>, <code>calendar.events</code>): To read your schedule, display upcoming events, check availability, and create or modify calendar events when instructed.
              </li>
              <li>
                <strong>Google Analytics Data API</strong> (<code>analytics.readonly</code>, <code>analytics</code>): To read your website analytics data and provide AI-powered performance insights and reports.
              </li>
            </ul>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              8.2 Limited Use Compliance
            </h3>
            <p>In accordance with Google&apos;s Limited Use requirements, BitBit:</p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>
                <strong>Only uses Google user data to provide and improve the Service&apos;s user-facing features.</strong> We use Gmail data to show you your emails, enable AI-assisted email management, and build entity context. We use Calendar data to display your schedule and enable scheduling features. We use Analytics data to generate reports.
              </li>
              <li>
                <strong>Does not transfer Google user data to third parties</strong> except: (a) as necessary to provide and improve user-facing features (e.g. sending relevant context to Anthropic&apos;s Claude API for AI processing as described in Section 6); (b) as necessary to comply with applicable law; or (c) as part of a merger, acquisition, or asset sale with notice to users.
              </li>
              <li>
                <strong>Does not use Google user data for serving advertisements</strong>, including retargeting, personalised, or interest-based advertising.
              </li>
              <li>
                <strong>Does not allow humans to read Google user data</strong> unless: (a) we have your affirmative consent for specific messages or content; (b) it is necessary for security purposes (such as investigating abuse); (c) it is necessary to comply with applicable law; or (d) our use is limited to internal operations and the data has been aggregated and anonymised.
              </li>
            </ul>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              8.3 Revoking Google Access
            </h3>
            <p>
              You can revoke BitBit&apos;s access to your Google data at any time by:
            </p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>Disconnecting the Google integration from your BitBit settings</li>
              <li>Removing BitBit from your Google account at{" "}
                <a href="https://myaccount.google.com/permissions" className="text-[#FF5A1F] underline hover:text-[#E44E17]" target="_blank" rel="noopener noreferrer">
                  myaccount.google.com/permissions
                </a>
              </li>
            </ul>
            <p className="mt-3">
              Upon revocation, we will stop accessing your Google data. Previously synced data used to build your Context Baseplate (entity profiles, semantic memories) may be retained until you request deletion.
            </p>
          </section>
        </BlurFade>

        {/* ── 9. Data Storage and Security ────────────────────────────────── */}
        <BlurFade delay={0.31} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              9. Data Storage and Security
            </h2>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              9.1 Where Your Data is Stored
            </h3>
            <p>
              Your primary application data is stored in a Supabase-managed PostgreSQL database hosted in the <strong>South Asia (Mumbai)</strong> region. Background workers run on Fly.io in the <strong>Sydney, Australia</strong> region. The application is hosted on Vercel&apos;s global edge network.
            </p>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              9.2 Security Measures
            </h3>
            <p>We implement the following security measures to protect your data:</p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li><strong>Encryption in transit:</strong> All data transmitted between your browser and our servers is encrypted using TLS. We enforce HSTS with a one-year max-age, including subdomains, with preload.</li>
              <li><strong>Row Level Security (RLS):</strong> Database-level access controls ensure that users can only access data belonging to their organisation.</li>
              <li><strong>Content Security Policy (CSP):</strong> Strict CSP headers prevent cross-site scripting attacks and limit resource loading to trusted domains.</li>
              <li><strong>CSRF Protection:</strong> Cross-site request forgery protection on all API routes in production.</li>
              <li><strong>Rate Limiting:</strong> IP-based and tiered rate limiting on authentication endpoints (20/min), webhook endpoints (100/min), and general API endpoints.</li>
              <li><strong>OAuth Security:</strong> PKCE (Proof Key for Code Exchange) for all Google OAuth flows. Cryptographically secure state parameters with constant-time comparison. OAuth state and code verifier stored in HTTP-only cookies.</li>
              <li><strong>Webhook Verification:</strong> HMAC-SHA256 signature verification for Stripe, Telnyx, and Slack webhooks with timestamp tolerance checks.</li>
              <li><strong>Clickjacking Protection:</strong> X-Frame-Options DENY and frame-ancestors &apos;none&apos; in CSP.</li>
              <li><strong>Permissions Policy:</strong> Camera, microphone, and geolocation access are disabled by default.</li>
              <li><strong>Circuit Breakers:</strong> Automatic circuit breakers on external API calls to prevent cascade failures.</li>
              <li><strong>Cost Guards:</strong> Daily budget limits on AI agent execution to prevent runaway costs.</li>
            </ul>
            <p className="mt-3">
              While we implement commercially reasonable security measures, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security of your data.
            </p>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              9.3 International Data Transfers
            </h3>
            <p>
              Your data may be transferred to and processed in countries outside of Australia, including the United States (where Anthropic, Vercel, Stripe, and Sentry are located) and India (where our Supabase database is hosted). For users in the EEA, these transfers are made pursuant to appropriate safeguards, including Standard Contractual Clauses (SCCs) where applicable.
            </p>
          </section>
        </BlurFade>

        {/* ── 10. Data Sharing and Disclosure ─────────────────────────────── */}
        <BlurFade delay={0.33} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              10. Data Sharing and Disclosure
            </h2>
            <p>
              We do not sell, rent, or trade your personal information to third parties. We share your information only in the following circumstances:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>
                <strong>Service providers:</strong> With the third-party providers listed in Section 7, solely to operate and deliver the Service.
              </li>
              <li>
                <strong>AI processing:</strong> With Anthropic, as described in Section 6, to provide AI-powered features.
              </li>
              <li>
                <strong>Connected Services:</strong> With the third-party services you explicitly connect (e.g. sending an email via Gmail API, creating a calendar event), solely to perform the actions you or your configured agents request.
              </li>
              <li>
                <strong>Legal requirements:</strong> When we believe disclosure is necessary to comply with applicable law, regulation, legal process, or governmental request.
              </li>
              <li>
                <strong>Safety and rights:</strong> To protect the rights, property, or safety of BitBit, our users, or the public.
              </li>
              <li>
                <strong>Business transfers:</strong> In connection with a merger, acquisition, reorganisation, or sale of assets, in which case we will notify affected users before personal information is transferred and becomes subject to a different privacy policy.
              </li>
            </ul>
          </section>
        </BlurFade>

        {/* ── 11. Cookies and Similar Technologies ────────────────────────── */}
        <BlurFade delay={0.35} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              11. Cookies and Similar Technologies
            </h2>
            <p>
              BitBit uses a minimal set of cookies, all of which are strictly necessary for the operation of the Service:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>
                <strong>Supabase session cookies:</strong> Used to maintain your authenticated session. These are HTTP-only, secure cookies managed by Supabase Auth.
              </li>
              <li>
                <strong>OAuth state cookies</strong> (<code>oauth_state</code>, <code>oauth_code_verifier</code>): Temporary cookies used during the OAuth flow to prevent CSRF attacks. These are deleted after the OAuth callback completes.
              </li>
            </ul>
            <p className="mt-3">
              We do not use advertising cookies, social media tracking pixels, or third-party analytics cookies. We do not participate in cross-site tracking.
            </p>
          </section>
        </BlurFade>

        {/* ── 12. Data Retention ──────────────────────────────────────────── */}
        <BlurFade delay={0.37} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              12. Data Retention
            </h2>
            <p>We retain your data according to the following principles:</p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>
                <strong>Account data:</strong> Retained for as long as your account is active and for a reasonable period thereafter to allow for reactivation or comply with legal obligations.
              </li>
              <li>
                <strong>Connected Service data:</strong> Synced data from Connected Services is retained for as long as the connection is active. When you disconnect a service, we stop syncing new data. Previously synced data may be retained as part of your Context Baseplate until you request deletion.
              </li>
              <li>
                <strong>Agent run logs:</strong> AI agent execution metadata (token counts, costs, durations, error messages) is retained for billing, auditing, and debugging purposes.
              </li>
              <li>
                <strong>Error tracking data:</strong> Sentry error reports are retained according to Sentry&apos;s data retention policies.
              </li>
              <li>
                <strong>Deleted accounts:</strong> When you request account deletion, we will delete or anonymise your personal data within 30 days, except where retention is required by law or legitimate business needs (e.g. billing records, fraud prevention).
              </li>
            </ul>
          </section>
        </BlurFade>

        {/* ── 13. Your Rights ────────────────────────────────────────────── */}
        <BlurFade delay={0.39} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              13. Your Rights
            </h2>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              13.1 Rights Under the Australian Privacy Act
            </h3>
            <p>Under the Australian Privacy Principles, you have the right to:</p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>Access your personal information held by us (APP 12)</li>
              <li>Request correction of inaccurate or incomplete personal information (APP 13)</li>
              <li>Make a complaint about a breach of the APPs</li>
              <li>Opt out of receiving direct marketing communications</li>
            </ul>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              13.2 Rights Under the GDPR (EEA/UK Users)
            </h3>
            <p>If you are located in the EEA or UK, you additionally have the right to:</p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li><strong>Access</strong> your personal data (Art. 15)</li>
              <li><strong>Rectification</strong> of inaccurate personal data (Art. 16)</li>
              <li><strong>Erasure</strong> (&quot;right to be forgotten&quot;) of your personal data (Art. 17)</li>
              <li><strong>Restriction</strong> of processing (Art. 18)</li>
              <li><strong>Data portability</strong> — receive your data in a structured, commonly used, machine-readable format (Art. 20)</li>
              <li><strong>Object</strong> to processing based on legitimate interests (Art. 21)</li>
              <li><strong>Withdraw consent</strong> at any time where processing is based on consent (Art. 7(3)), without affecting the lawfulness of processing before withdrawal</li>
              <li><strong>Lodge a complaint</strong> with a supervisory authority</li>
            </ul>

            <h3 className="mt-6 mb-3 text-[16px] font-semibold text-[#1a1a1a]">
              13.3 Exercising Your Rights
            </h3>
            <p>
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:privacy@bitbit.chat" className="text-[#FF5A1F] underline hover:text-[#E44E17]">
                privacy@bitbit.chat
              </a>
              . We will respond to your request within 30 days (or sooner where required by law). We may need to verify your identity before processing your request.
            </p>
            <p className="mt-3">
              You can also manage many aspects of your data directly within BitBit, including:
            </p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>Disconnecting Connected Services from your settings</li>
              <li>Deleting tasks, contacts, and other content you have created</li>
              <li>Configuring notification preferences</li>
              <li>Revoking OAuth access via your Google, Microsoft, or other provider account settings</li>
            </ul>
          </section>
        </BlurFade>

        {/* ── 14. Children's Privacy ──────────────────────────────────────── */}
        <BlurFade delay={0.41} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              14. Children&apos;s Privacy
            </h2>
            <p>
              BitBit is not intended for use by anyone under the age of 18. We do not knowingly collect personal information from children under 18. If you become aware that a child has provided us with personal information, please contact us at{" "}
              <a href="mailto:privacy@bitbit.chat" className="text-[#FF5A1F] underline hover:text-[#E44E17]">
                privacy@bitbit.chat
              </a>{" "}
              and we will take steps to delete such information.
            </p>
          </section>
        </BlurFade>

        {/* ── 15. Automated Decision-Making ──────────────────────────────── */}
        <BlurFade delay={0.43} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              15. Automated Decision-Making and Profiling
            </h2>
            <p>
              BitBit&apos;s AI agents perform automated processing, including:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>
                <strong>Classification:</strong> Incoming messages are automatically classified by priority and routed to appropriate agents.
              </li>
              <li>
                <strong>Confidence-based action routing:</strong> AI agents assess a confidence score before taking actions. Actions below your configured confidence threshold are queued for your manual approval rather than executed automatically.
              </li>
              <li>
                <strong>Entity profiling:</strong> The Context Baseplate automatically builds profiles of people and organisations you interact with, based on data from your Connected Services.
              </li>
              <li>
                <strong>Sentiment analysis:</strong> Messages may be analysed for sentiment to prioritise urgent or negative communications.
              </li>
            </ul>
            <p className="mt-3">
              These automated processes are designed to assist you and are subject to your control. You can configure confidence thresholds, review approval queues, and override any automated decision. No solely automated decision is made that produces legal effects or similarly significantly affects you without your explicit input.
            </p>
          </section>
        </BlurFade>

        {/* ── 16. Notification Channels ───────────────────────────────────── */}
        <BlurFade delay={0.45} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              16. Notification Channels
            </h2>
            <p>
              BitBit may send you notifications through the following channels:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li><strong>In-dashboard notifications:</strong> Displayed within the BitBit application.</li>
              <li><strong>Email:</strong> Sent via Resend from <code>bitbit@bitbit.chat</code>. Includes approval requests, alert escalations, daily digests, and weekly reports.</li>
              <li><strong>WhatsApp:</strong> Approval requests, digests, and urgent notifications sent via the Meta Cloud API.</li>
            </ul>
            <p className="mt-3">
              You can configure your notification preferences within BitBit&apos;s settings, including which channels are active and which notification types you receive. Critical security notifications may bypass your preferences to ensure service integrity.
            </p>
          </section>
        </BlurFade>

        {/* ── 17. Open-Source and Third-Party Components ──────────────────── */}
        <BlurFade delay={0.47} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              17. Open-Source and Third-Party Components
            </h2>
            <p>
              BitBit is built using open-source software components including Next.js, React, and various npm packages. These components do not independently collect or process your personal information through BitBit.
            </p>
          </section>
        </BlurFade>

        {/* ── 18. Changes to This Privacy Policy ─────────────────────────── */}
        <BlurFade delay={0.49} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              18. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we will:
            </p>
            <ul className="mt-4 space-y-1 ml-6 list-disc">
              <li>Update the &quot;Last updated&quot; date at the top of this page</li>
              <li>Notify you via email or an in-dashboard notification at least 14 days before the changes take effect</li>
              <li>Where material changes affect your Google API data usage, we will seek your renewed consent where required</li>
            </ul>
            <p className="mt-3">
              Your continued use of the Service after the effective date of any changes constitutes your acceptance of the updated Privacy Policy.
            </p>
          </section>
        </BlurFade>

        {/* ── 19. Complaints ─────────────────────────────────────────────── */}
        <BlurFade delay={0.51} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              19. Complaints
            </h2>
            <p>
              If you believe we have breached the Australian Privacy Principles or the GDPR, you may lodge a complaint with us at{" "}
              <a href="mailto:privacy@bitbit.chat" className="text-[#FF5A1F] underline hover:text-[#E44E17]">
                privacy@bitbit.chat
              </a>
              . We will investigate and respond within 30 days.
            </p>
            <p className="mt-3">
              If you are not satisfied with our response, you may escalate your complaint to:
            </p>
            <ul className="mt-2 space-y-1 ml-6 list-disc">
              <li>
                <strong>Australia:</strong> The Office of the Australian Information Commissioner (OAIC) at{" "}
                <a href="https://www.oaic.gov.au" className="text-[#FF5A1F] underline hover:text-[#E44E17]" target="_blank" rel="noopener noreferrer">
                  www.oaic.gov.au
                </a>
              </li>
              <li>
                <strong>EEA/UK:</strong> Your local data protection supervisory authority
              </li>
            </ul>
          </section>
        </BlurFade>

        {/* ── 20. Contact Us ─────────────────────────────────────────────── */}
        <BlurFade delay={0.53} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              20. Contact Us
            </h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="mt-4 rounded-lg border border-[#e8e4dc] bg-[#faf9f0] p-6">
              <p className="font-semibold text-[#1a1a1a]">BitBit Privacy</p>
              <p className="mt-1">Operated by All Webbed Up</p>
              <p className="mt-3">
                Email:{" "}
                <a href="mailto:privacy@bitbit.chat" className="text-[#FF5A1F] underline hover:text-[#E44E17]">
                  privacy@bitbit.chat
                </a>
              </p>
              <p className="mt-1">
                Website:{" "}
                <a href="https://bitbit.chat" className="text-[#FF5A1F] underline hover:text-[#E44E17]">
                  bitbit.chat
                </a>
              </p>
              <p className="mt-1">Location: Australia</p>
            </div>
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
