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
          Last updated: March 11, 2026
        </p>
      </BlurFade>

      <div className="prose prose-invert max-w-none space-y-8 text-[15px] text-[#6b6560]">

        {/* 1. Agreement to Terms */}
        <BlurFade delay={0.12} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              1. Agreement to Terms
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;you&quot;, &quot;your&quot;, or &quot;User&quot;) and All Webbed Up, an Australian business operating under the trade name BitBit (&quot;BitBit&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), governing your access to and use of the BitBit platform, including the website at bitbit.chat, the application at app.bitbit.chat, all associated APIs, AI agents, integrations, and related services (collectively, the &quot;Service&quot;).
            </p>
            <p className="mt-3">
              By creating an account, accessing, or using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms and our <Link href="/privacy" className="text-[#d97757] underline decoration-[#d97757]/30 hover:decoration-[#d97757]">Privacy Policy</Link>, which is incorporated herein by reference. If you are using the Service on behalf of an organisation, you represent and warrant that you have authority to bind that organisation to these Terms.
            </p>
            <p className="mt-3">
              If you do not agree to these Terms, you must not access or use the Service.
            </p>
          </section>
        </BlurFade>

        {/* 2. Description of Service */}
        <BlurFade delay={0.14} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              2. Description of Service
            </h2>
            <p>
              BitBit is an agentic AI operations platform that acts as a personal assistant for business operators. The Service provides:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li><strong>AI Agent Operations:</strong> Autonomous specialist AI agents that process and act upon your emails, messages, calendar events, invoices, leads, proposals, and other business data on your behalf. Agents include, but are not limited to, Channel Triage, Invoice Flow, Lead Swarm, Client Comms, Proposal Bot, Tender Hunter, Ad Script Generator, Client Onboarding, AI Search Optimizer, and Sentry monitoring.</li>
              <li><strong>Integration Connections:</strong> OAuth-based connections to third-party services including Google (Gmail, Google Calendar, Google Analytics), Microsoft Outlook, Slack, WhatsApp, Instagram, Facebook Messenger, Xero, Asana, ClickUp, Calendly, Stripe, Telegram, WordPress, and others.</li>
              <li><strong>Communication Channels:</strong> Multi-channel messaging capabilities including WhatsApp (via Meta Cloud API and bridge relay), SMS (via Telnyx), email (via Resend), and other messaging platforms.</li>
              <li><strong>Context Intelligence:</strong> An AI-powered knowledge base (&quot;Context Baseplate&quot;) that builds entity profiles, relationship graphs, behavioural patterns, and cross-references from your connected data sources to enable proactive agent decision-making.</li>
              <li><strong>Dashboard and Analytics:</strong> A web-based dashboard providing task management, lead pipelines, invoice management, agent activity monitoring, approval queues, and analytics reporting.</li>
              <li><strong>Confidence-Based Routing:</strong> An automated system that determines whether AI agents should act autonomously, seek your approval, or escalate to you based on configurable confidence thresholds.</li>
            </ul>
          </section>
        </BlurFade>

        {/* 3. Eligibility and Account Registration */}
        <BlurFade delay={0.16} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              3. Eligibility and Account Registration
            </h2>
            <p>
              <strong>3.1 Eligibility.</strong> You must be at least 18 years of age and have the legal capacity to enter into a binding agreement to use the Service. If you are using the Service on behalf of a business or other legal entity, you represent that you have the authority to bind that entity to these Terms.
            </p>
            <p className="mt-3">
              <strong>3.2 Account Creation.</strong> To access the Service, you must create an account by providing accurate and complete information. You may register using email and password or through a supported third-party authentication provider (such as Google OAuth). You agree to keep your account information current and accurate.
            </p>
            <p className="mt-3">
              <strong>3.3 Account Security.</strong> You are responsible for maintaining the confidentiality of your account credentials, including your password and any API keys or access tokens. You must immediately notify us at legal@bitbit.chat of any unauthorised access to or use of your account. You are liable for all activities that occur under your account, whether or not authorised by you.
            </p>
            <p className="mt-3">
              <strong>3.4 Personal and Organisational Accounts.</strong> The Service supports both personal accounts (for individual use) and organisational accounts (for team or business use). Organisational accounts may have multiple users with different permission levels. The account owner or administrator is responsible for managing user access and ensuring all users comply with these Terms.
            </p>
          </section>
        </BlurFade>

        {/* 4. AI Agents and Automated Actions */}
        <BlurFade delay={0.18} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              4. AI Agents and Automated Actions
            </h2>
            <p>
              <strong>4.1 Nature of AI Agents.</strong> BitBit uses artificial intelligence, including large language models provided by third-party AI providers (such as Anthropic), to power specialist agents that operate on your behalf. These agents can read, analyse, classify, draft, and in some cases send communications; create and manage invoices; process leads; generate proposals; and perform other business operations based on your data and instructions.
            </p>
            <p className="mt-3">
              <strong>4.2 Autonomous and Supervised Actions.</strong> Agents operate according to a confidence-based routing system. Depending on the assessed confidence of a given action and the risk profile of the agent type, the system may:
            </p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li><strong>Act autonomously</strong> when confidence exceeds the configured threshold (e.g., categorising an email, creating a task).</li>
              <li><strong>Request your approval</strong> when confidence falls within an intermediate range (e.g., sending a client communication, creating an invoice).</li>
              <li><strong>Escalate to you</strong> when confidence is low or the action carries significant risk.</li>
            </ul>
            <p className="mt-3">
              <strong>4.3 Approval Queue.</strong> Actions that require your approval are placed in an approval queue. You may approve or reject pending actions via the dashboard or via WhatsApp. Unresolved approvals may expire automatically after a configured period.
            </p>
            <p className="mt-3">
              <strong>4.4 Your Responsibility for AI Actions.</strong> You acknowledge and agree that:
            </p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>AI agents act as your tool and on your behalf. You remain responsible for all actions taken by agents operating under your account, including autonomous actions.</li>
              <li>AI-generated outputs, including drafted communications, proposals, invoices, and classifications, may contain errors, inaccuracies, or inappropriate content. You should review agent outputs, particularly for high-stakes actions involving financial commitments or external communications.</li>
              <li>You are responsible for configuring appropriate confidence thresholds and reviewing agent behaviour to ensure it aligns with your expectations.</li>
              <li>BitBit does not guarantee the accuracy, completeness, reliability, or appropriateness of any AI-generated content or automated action.</li>
            </ul>
            <p className="mt-3">
              <strong>4.5 No Professional Advice.</strong> AI agent outputs do not constitute legal, financial, tax, medical, or other professional advice. You should seek appropriate professional counsel before acting on any AI-generated recommendation, particularly in relation to invoicing, pricing, contracts, or tender submissions.
            </p>
          </section>
        </BlurFade>

        {/* 5. Third-Party Integrations and Services */}
        <BlurFade delay={0.20} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              5. Third-Party Integrations and Services
            </h2>
            <p>
              <strong>5.1 Connected Services.</strong> The Service enables you to connect to and interact with third-party platforms and services, including but not limited to Google Workspace (Gmail, Google Calendar, Google Analytics), Microsoft Outlook, Slack, Meta (WhatsApp, Instagram, Facebook Messenger), Xero, Stripe, Asana, ClickUp, Calendly, Telnyx, Telegram, and WordPress. These connections are established through OAuth, API keys, or webhook integrations.
            </p>
            <p className="mt-3">
              <strong>5.2 Third-Party Terms.</strong> Your use of any connected third-party service is subject to that service&apos;s own terms of service, privacy policy, and applicable usage policies. You are responsible for complying with all such third-party terms. BitBit is not a party to any agreement between you and a third-party service provider.
            </p>
            <p className="mt-3">
              <strong>5.3 Google API Services.</strong> BitBit&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-[#d97757] underline decoration-[#d97757]/30 hover:decoration-[#d97757]" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. We only request the minimum scopes necessary to provide the Service (such as reading and sending email, accessing calendar events, and reading analytics data). We do not use Google user data for advertising purposes or transfer it to third parties except as necessary to provide and improve the Service or as required by law.
            </p>
            <p className="mt-3">
              <strong>5.4 OAuth Credentials.</strong> When you authorise a third-party connection, BitBit stores the resulting access tokens and refresh tokens in encrypted form. You may revoke any connection at any time through the BitBit dashboard or through the third-party provider&apos;s settings. Upon revocation or account deletion, we will delete stored tokens for the relevant connection.
            </p>
            <p className="mt-3">
              <strong>5.5 No Warranty for Third-Party Services.</strong> BitBit does not control and is not responsible for the availability, accuracy, content, or security of third-party services. We are not liable for any loss or damage arising from your use of, or reliance on, any third-party service accessed through the Service. Third-party services may change their APIs, terms, or functionality at any time, which may affect BitBit&apos;s ability to provide certain features.
            </p>
            <p className="mt-3">
              <strong>5.6 AI Model Providers.</strong> The Service uses AI models provided by third-party providers (currently Anthropic). The processing of your data by AI model providers is subject to their respective terms and privacy policies. We select AI providers that offer appropriate data handling and privacy protections, but we do not control their services. Changes to AI model capabilities, pricing, or availability may affect the Service.
            </p>
          </section>
        </BlurFade>

        {/* 6. Subscription Plans, Billing, and Trials */}
        <BlurFade delay={0.22} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              6. Subscription Plans, Billing, and Trials
            </h2>
            <p>
              <strong>6.1 Plans.</strong> The Service is offered across multiple subscription tiers: Free, Starter, Growth, and Scale. Each tier provides different levels of access to features, AI agents, integration connections, and usage limits. Current plan details and pricing are available on our <Link href="/pricing" className="text-[#d97757] underline decoration-[#d97757]/30 hover:decoration-[#d97757]">Pricing page</Link>. Prices are denominated in Australian dollars (AUD) unless otherwise indicated.
            </p>
            <p className="mt-3">
              <strong>6.2 Free Tier.</strong> The Free tier provides limited access to the Service at no cost. We reserve the right to modify the features, usage limits, and availability of the Free tier at any time.
            </p>
            <p className="mt-3">
              <strong>6.3 Free Trials.</strong> Paid plans may include a free trial period (currently 14 days). At the end of the trial period, you will be charged the applicable subscription fee unless you downgrade or cancel before the trial expires. A grace period of 3 days applies after trial expiration, during which you retain limited access before the account reverts to the Free tier.
            </p>
            <p className="mt-3">
              <strong>6.4 Billing.</strong> Paid subscriptions are billed monthly in advance. Payment is processed by Stripe, a third-party payment processor. By subscribing to a paid plan, you authorise us to charge the applicable fees to your designated payment method. You are responsible for providing accurate and current billing information.
            </p>
            <p className="mt-3">
              <strong>6.5 Price Changes.</strong> We may change subscription fees at any time. If we change the fees for your current subscription, we will provide you with at least 30 days&apos; notice before the change takes effect. Continued use of the Service after the effective date of a price change constitutes your acceptance of the new fees.
            </p>
            <p className="mt-3">
              <strong>6.6 Cancellation and Downgrade.</strong> You may cancel your paid subscription or downgrade to a lower tier at any time through your account settings. Upon cancellation, your access to paid features will continue until the end of your current billing period. We do not provide pro-rata refunds for partial billing periods unless required by applicable law.
            </p>
            <p className="mt-3">
              <strong>6.7 Refunds.</strong> Refund requests are assessed on a case-by-case basis. This does not affect your rights under Australian Consumer Law (see Section 15).
            </p>
          </section>
        </BlurFade>

        {/* 7. Acceptable Use */}
        <BlurFade delay={0.24} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              7. Acceptable Use Policy
            </h2>
            <p>
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>Use the Service to send unsolicited bulk messages (spam), including via WhatsApp, SMS, email, or any other communication channel.</li>
              <li>Abuse automated messaging capabilities to harass, threaten, defame, or intimidate any person or entity.</li>
              <li>Use the AI agents to generate content that is unlawful, harmful, threatening, abusive, defamatory, obscene, invasive of another&apos;s privacy, or otherwise objectionable.</li>
              <li>Attempt to circumvent, disable, or interfere with any security features of the Service, including rate limits, authentication mechanisms, or confidence thresholds.</li>
              <li>Use the Service to violate any applicable law or regulation, including but not limited to the Australian Spam Act 2003, the Privacy Act 1988 (Cth), anti-money laundering laws, or sanctions regulations.</li>
              <li>Use the Service to infringe on the intellectual property rights, privacy rights, or other rights of any third party.</li>
              <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Service or any AI models used by the Service.</li>
              <li>Resell, sublicence, or redistribute access to the Service without our prior written consent.</li>
              <li>Transmit any malware, viruses, or other harmful code through the Service.</li>
              <li>Create multiple free accounts to circumvent usage limits or plan restrictions.</li>
              <li>Use the Service in any way that could damage, disable, overburden, or impair the Service or interfere with any other party&apos;s use of the Service.</li>
              <li>Misrepresent AI-generated communications as having been personally written by a human where such misrepresentation would be misleading or deceptive under applicable law.</li>
            </ul>
            <p className="mt-4">
              We reserve the right to investigate and take appropriate action against any suspected violation of this Acceptable Use Policy, including suspending or terminating your account and reporting to law enforcement authorities where appropriate.
            </p>
          </section>
        </BlurFade>

        {/* 8. Intellectual Property */}
        <BlurFade delay={0.26} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              8. Intellectual Property
            </h2>
            <p>
              <strong>8.1 BitBit Platform IP.</strong> The Service, including its software, algorithms, agent logic, user interface, design, documentation, and all related intellectual property, is owned by All Webbed Up (trading as BitBit) and is protected by copyright, trademark, and other intellectual property laws. These Terms do not grant you any right, title, or interest in the Service other than a limited, non-exclusive, non-transferable, revocable licence to use the Service in accordance with these Terms.
            </p>
            <p className="mt-3">
              <strong>8.2 Your Content.</strong> You retain all rights, title, and interest in and to any data, content, messages, documents, or other materials that you submit to, upload to, or transmit through the Service (&quot;Your Content&quot;). By using the Service, you grant us a limited, non-exclusive, worldwide licence to use, process, store, and transmit Your Content solely as necessary to provide and improve the Service, including processing by AI agents and AI model providers. This licence terminates when you delete Your Content or close your account, except where retention is required by law or for legitimate business purposes (such as backup and audit logs).
            </p>
            <p className="mt-3">
              <strong>8.3 AI-Generated Outputs.</strong> Content generated by AI agents in the course of providing the Service (&quot;AI Outputs&quot;), such as drafted emails, proposals, reports, and classifications, is generated for your use. As between you and BitBit, you own AI Outputs generated specifically for you or your organisation. However, you acknowledge that similar AI Outputs may be generated for other users, and BitBit does not guarantee the uniqueness or exclusivity of any AI Output.
            </p>
            <p className="mt-3">
              <strong>8.4 Feedback.</strong> If you provide suggestions, ideas, or feedback about the Service (&quot;Feedback&quot;), you grant us a perpetual, irrevocable, worldwide, royalty-free licence to use, incorporate, and commercialise the Feedback without any obligation or compensation to you.
            </p>
            <p className="mt-3">
              <strong>8.5 Trademarks.</strong> &quot;BitBit&quot; and any associated logos or marks are trademarks of All Webbed Up. You may not use these marks without our prior written consent, except as reasonably necessary to refer to the Service in a truthful, non-misleading manner.
            </p>
          </section>
        </BlurFade>

        {/* 9. Data Processing and Privacy */}
        <BlurFade delay={0.28} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              9. Data Processing and Privacy
            </h2>
            <p>
              <strong>9.1 Privacy Policy.</strong> Our collection, use, storage, and disclosure of personal information is governed by our <Link href="/privacy" className="text-[#d97757] underline decoration-[#d97757]/30 hover:decoration-[#d97757]">Privacy Policy</Link>. By using the Service, you consent to the data practices described in that policy.
            </p>
            <p className="mt-3">
              <strong>9.2 Data Processing by AI.</strong> To provide the Service, your data (including emails, messages, calendar events, contact information, invoices, and other connected data) is processed by our AI agents and by third-party AI model providers. This processing includes analysis, classification, pattern extraction, entity resolution, and content generation. We implement appropriate security measures, including encryption in transit and at rest, to protect your data during processing.
            </p>
            <p className="mt-3">
              <strong>9.3 Context Baseplate.</strong> The Service builds a compiled understanding of your business context (&quot;Context Baseplate&quot;) by extracting entities, relationships, behavioural patterns, and active threads from your connected data. This data is specific to your account or organisation and is not shared with other users.
            </p>
            <p className="mt-3">
              <strong>9.4 Data Location.</strong> Your data is primarily stored on servers located in the Asia-Pacific region (including Australia and India). Background processing infrastructure may be located in other regions. By using the Service, you consent to the transfer and processing of your data in these locations.
            </p>
            <p className="mt-3">
              <strong>9.5 Data Deletion.</strong> You may request deletion of your account and associated data by contacting us at legal@bitbit.chat. Upon account deletion, we will delete or de-identify your data within a reasonable timeframe, subject to any legal retention obligations. Some residual data may persist in backups for a limited period.
            </p>
          </section>
        </BlurFade>

        {/* 10. Communications via the Service */}
        <BlurFade delay={0.30} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              10. Communications Sent via the Service
            </h2>
            <p>
              <strong>10.1 Outbound Communications.</strong> The Service may send communications on your behalf through connected channels, including email, WhatsApp, SMS, and other messaging platforms. You are solely responsible for the content and legality of all communications sent through the Service under your account, whether initiated by you directly or by an AI agent acting on your behalf.
            </p>
            <p className="mt-3">
              <strong>10.2 Compliance with Messaging Laws.</strong> You agree to comply with all applicable laws and regulations governing electronic communications, including the Australian Spam Act 2003, the Telecommunications Act 1997, and any equivalent laws in jurisdictions where your message recipients are located. This includes obtaining necessary consent before sending commercial messages and including required identification and unsubscribe mechanisms.
            </p>
            <p className="mt-3">
              <strong>10.3 Rate Limits and Sending Limits.</strong> The Service implements rate limits on outbound communications to prevent abuse and comply with third-party platform policies. We may restrict or suspend your sending capabilities if we detect activity that violates this policy or third-party platform rules.
            </p>
            <p className="mt-3">
              <strong>10.4 Service Communications.</strong> By creating an account, you agree to receive transactional and service-related communications from us, including account notifications, approval requests, daily digests, onboarding emails, and security alerts. You may adjust your notification preferences in your account settings. You may not opt out of critical security or account-related notifications.
            </p>
          </section>
        </BlurFade>

        {/* 11. Confidentiality */}
        <BlurFade delay={0.32} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              11. Confidentiality
            </h2>
            <p>
              <strong>11.1 Your Confidential Information.</strong> We treat your business data, connected service credentials, agent configurations, and organisational information as confidential. We will not disclose your confidential information to third parties except: (a) as necessary to provide the Service (including to AI model providers and infrastructure partners); (b) with your express consent; (c) as required by law, regulation, or valid legal process; or (d) to protect the rights, safety, or property of BitBit, our users, or the public.
            </p>
            <p className="mt-3">
              <strong>11.2 Aggregated and De-Identified Data.</strong> We may collect and use aggregated, anonymised, or de-identified data derived from your use of the Service for purposes including improving the Service, conducting research, and generating industry benchmarks. Such data will not identify you or your organisation.
            </p>
          </section>
        </BlurFade>

        {/* 12. Disclaimers and Limitation of Liability */}
        <BlurFade delay={0.34} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              12. Disclaimers
            </h2>
            <p>
              <strong>12.1 &quot;As Is&quot; Basis.</strong> To the maximum extent permitted by applicable law, the Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We disclaim all warranties, whether express, implied, or statutory, including but not limited to implied warranties of merchantability, fitness for a particular purpose, non-infringement, and any warranties arising from course of dealing or usage of trade.
            </p>
            <p className="mt-3">
              <strong>12.2 AI Limitations.</strong> Without limiting the foregoing, we specifically disclaim any warranty or representation that:
            </p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>AI agent outputs will be accurate, complete, timely, reliable, or free from error.</li>
              <li>AI agents will correctly interpret, classify, or respond to all communications or data.</li>
              <li>Autonomous agent actions will always align with your intentions or expectations.</li>
              <li>The confidence-based routing system will always make appropriate decisions about when to act, ask, or escalate.</li>
              <li>AI-generated invoices, proposals, communications, or other business documents will be legally compliant, commercially appropriate, or factually correct.</li>
            </ul>
            <p className="mt-3">
              <strong>12.3 Service Availability.</strong> We do not warrant that the Service will be uninterrupted, secure, or error-free, or that defects will be corrected. The Service depends on third-party infrastructure, APIs, and AI model providers, any of which may experience downtime, errors, or changes beyond our control.
            </p>
          </section>
        </BlurFade>

        {/* 13. Limitation of Liability */}
        <BlurFade delay={0.36} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              13. Limitation of Liability
            </h2>
            <p>
              <strong>13.1 Exclusion of Consequential Damages.</strong> To the maximum extent permitted by applicable law, in no event will BitBit, All Webbed Up, its directors, employees, contractors, agents, or affiliates be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to damages for loss of profits, revenue, goodwill, data, business opportunities, or anticipated savings, arising out of or in connection with the Service, even if we have been advised of the possibility of such damages.
            </p>
            <p className="mt-3">
              <strong>13.2 Cap on Liability.</strong> To the maximum extent permitted by applicable law, our total aggregate liability to you for all claims arising out of or relating to these Terms or the Service shall not exceed the greater of: (a) the total fees paid by you to BitBit during the twelve (12) months immediately preceding the event giving rise to the claim; or (b) one hundred Australian dollars (AUD $100).
            </p>
            <p className="mt-3">
              <strong>13.3 Specific AI Liability Exclusions.</strong> Without limiting the above, we are not liable for:
            </p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>Any loss or damage resulting from actions taken by AI agents on your behalf, including incorrect invoices, inappropriate communications, missed deadlines, or erroneous data processing.</li>
              <li>Any loss or damage arising from your reliance on AI-generated content, classifications, recommendations, or decisions.</li>
              <li>Any loss or damage resulting from the failure of AI agents to detect, process, or act upon incoming communications, leads, or events.</li>
              <li>Any third-party claims arising from communications sent on your behalf by the Service.</li>
            </ul>
            <p className="mt-3">
              <strong>13.4 Basis of the Bargain.</strong> You acknowledge that BitBit has set its fees and entered into these Terms in reliance upon the disclaimers and limitations of liability set forth herein, which allocate risk between you and BitBit and form an essential basis of the bargain between the parties.
            </p>
          </section>
        </BlurFade>

        {/* 14. Indemnification */}
        <BlurFade delay={0.38} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              14. Indemnification
            </h2>
            <p>
              You agree to indemnify, defend, and hold harmless BitBit, All Webbed Up, and their directors, officers, employees, contractors, and agents from and against any claims, demands, losses, damages, liabilities, costs, and expenses (including reasonable legal fees) arising out of or relating to:
            </p>
            <ul className="mt-4 space-y-2 ml-6 list-disc">
              <li>Your use of the Service, including actions taken by AI agents on your behalf.</li>
              <li>Your Content or any data you provide through the Service.</li>
              <li>Communications sent through the Service under your account.</li>
              <li>Your violation of these Terms or any applicable law or regulation.</li>
              <li>Your infringement of any third party&apos;s rights, including intellectual property rights or privacy rights.</li>
              <li>Any dispute between you and a third party arising from your use of the Service.</li>
            </ul>
          </section>
        </BlurFade>

        {/* 15. Australian Consumer Law */}
        <BlurFade delay={0.40} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              15. Australian Consumer Law
            </h2>
            <p>
              <strong>15.1 Consumer Guarantees.</strong> If you are a &quot;consumer&quot; within the meaning of the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)), certain statutory guarantees apply to the supply of the Service that cannot be excluded, restricted, or modified. Nothing in these Terms excludes, restricts, or modifies any consumer guarantee or any right you may have under the Australian Consumer Law to the extent that it cannot lawfully be excluded, restricted, or modified.
            </p>
            <p className="mt-3">
              <strong>15.2 Limitation for Non-Excludable Guarantees.</strong> To the extent that the Australian Consumer Law permits us to limit our liability for breach of any non-excludable consumer guarantee, our liability is limited (at our option) to:
            </p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>In the case of services: supplying the services again, or paying the cost of having the services supplied again.</li>
              <li>In the case of goods (if applicable): replacing the goods or supplying equivalent goods, repairing the goods, paying the cost of replacing the goods or acquiring equivalent goods, or paying the cost of having the goods repaired.</li>
            </ul>
            <p className="mt-3">
              <strong>15.3 Cooling-Off Period.</strong> Where a cooling-off period applies under applicable Australian consumer protection legislation, you may exercise your right to cancel within the applicable period.
            </p>
          </section>
        </BlurFade>

        {/* 16. Termination */}
        <BlurFade delay={0.42} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              16. Termination
            </h2>
            <p>
              <strong>16.1 Termination by You.</strong> You may terminate your account at any time by contacting us at legal@bitbit.chat or through the account settings in the dashboard. Upon termination, your right to use the Service will immediately cease. Any fees already paid are non-refundable except as required by applicable law.
            </p>
            <p className="mt-3">
              <strong>16.2 Termination by Us.</strong> We may suspend or terminate your account and access to the Service at any time, with or without cause, including if:
            </p>
            <ul className="mt-2 space-y-2 ml-6 list-disc">
              <li>You breach these Terms or our Acceptable Use Policy.</li>
              <li>Your account has been inactive for an extended period.</li>
              <li>We are required to do so by law or a valid legal order.</li>
              <li>Continued provision of the Service to you would be impractical or commercially unreasonable.</li>
            </ul>
            <p className="mt-3">
              We will make reasonable efforts to provide you with notice before termination, except where immediate termination is necessary to prevent harm, comply with a legal obligation, or address a security incident.
            </p>
            <p className="mt-3">
              <strong>16.3 Effect of Termination.</strong> Upon termination, your data will be handled in accordance with Section 9.5 (Data Deletion). Sections 8 (Intellectual Property), 12 (Disclaimers), 13 (Limitation of Liability), 14 (Indemnification), 15 (Australian Consumer Law), 18 (Governing Law), and 19 (Dispute Resolution) survive termination.
            </p>
          </section>
        </BlurFade>

        {/* 17. Modifications to the Service and Terms */}
        <BlurFade delay={0.44} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              17. Modifications to the Service and Terms
            </h2>
            <p>
              <strong>17.1 Modifications to the Service.</strong> We reserve the right to modify, update, suspend, or discontinue the Service (or any part thereof), including adding or removing agents, integrations, features, or supported platforms, at any time with or without notice. We will not be liable to you or any third party for any modification, suspension, or discontinuance of the Service.
            </p>
            <p className="mt-3">
              <strong>17.2 Modifications to Terms.</strong> We may revise these Terms from time to time. If we make material changes, we will provide notice by updating the &quot;Last updated&quot; date at the top of this page and, where practicable, by sending you an email or in-app notification at least 14 days before the changes take effect. Your continued use of the Service after the effective date of revised Terms constitutes your acceptance of those revised Terms. If you do not agree to the revised Terms, you must stop using the Service and terminate your account.
            </p>
          </section>
        </BlurFade>

        {/* 18. Governing Law and Jurisdiction */}
        <BlurFade delay={0.46} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              18. Governing Law and Jurisdiction
            </h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of Queensland, Australia, without regard to its conflict of law principles. Subject to Section 19, you agree to submit to the exclusive jurisdiction of the courts of Queensland, Australia, for any disputes arising out of or relating to these Terms or the Service.
            </p>
          </section>
        </BlurFade>

        {/* 19. Dispute Resolution */}
        <BlurFade delay={0.48} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              19. Dispute Resolution
            </h2>
            <p>
              <strong>19.1 Informal Resolution.</strong> Before commencing formal legal proceedings, you agree to first attempt to resolve any dispute informally by contacting us at legal@bitbit.chat. We will endeavour to resolve disputes within 30 days of receipt of your written notification.
            </p>
            <p className="mt-3">
              <strong>19.2 Mediation.</strong> If a dispute cannot be resolved informally, either party may refer the dispute to mediation administered by a mediator agreed upon by both parties, or failing agreement, a mediator appointed by the Resolution Institute (or its successor). The mediation will be conducted in Brisbane, Queensland, unless the parties agree otherwise.
            </p>
            <p className="mt-3">
              <strong>19.3 Litigation.</strong> If the dispute remains unresolved after mediation, either party may commence proceedings in the courts of Queensland, Australia.
            </p>
            <p className="mt-3">
              <strong>19.4 Injunctive Relief.</strong> Nothing in this Section prevents either party from seeking urgent injunctive or interlocutory relief from a court of competent jurisdiction.
            </p>
          </section>
        </BlurFade>

        {/* 20. General Provisions */}
        <BlurFade delay={0.50} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              20. General Provisions
            </h2>
            <p>
              <strong>20.1 Entire Agreement.</strong> These Terms, together with the Privacy Policy and any other policies or agreements referenced herein, constitute the entire agreement between you and BitBit with respect to the subject matter hereof and supersede all prior or contemporaneous communications, whether oral or written.
            </p>
            <p className="mt-3">
              <strong>20.2 Severability.</strong> If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, that provision shall be modified to the minimum extent necessary to make it valid and enforceable, or if modification is not possible, severed from these Terms. The remaining provisions shall continue in full force and effect.
            </p>
            <p className="mt-3">
              <strong>20.3 Waiver.</strong> Our failure to enforce any right or provision of these Terms shall not constitute a waiver of that right or provision. Any waiver must be in writing and signed by an authorised representative of BitBit.
            </p>
            <p className="mt-3">
              <strong>20.4 Assignment.</strong> You may not assign or transfer your rights or obligations under these Terms without our prior written consent. We may assign or transfer our rights and obligations under these Terms without your consent in connection with a merger, acquisition, reorganisation, or sale of all or substantially all of our assets.
            </p>
            <p className="mt-3">
              <strong>20.5 Force Majeure.</strong> Neither party will be liable for any failure or delay in performance of its obligations under these Terms caused by events beyond its reasonable control, including but not limited to natural disasters, pandemics, government actions, network failures, third-party service outages, or interruptions to AI model provider services.
            </p>
            <p className="mt-3">
              <strong>20.6 Notices.</strong> We may provide notices to you by email to the address associated with your account, by posting on the Service, or by other reasonable means. You may provide notices to us by emailing legal@bitbit.chat.
            </p>
            <p className="mt-3">
              <strong>20.7 No Partnership or Agency.</strong> Nothing in these Terms creates a partnership, joint venture, or agency relationship between you and BitBit. Neither party has the authority to bind the other.
            </p>
          </section>
        </BlurFade>

        {/* 21. Contact Information */}
        <BlurFade delay={0.52} inView>
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#1a1a1a]">
              21. Contact Information
            </h2>
            <p>
              If you have any questions, concerns, or requests regarding these Terms, please contact us at:
            </p>
            <div className="mt-4 rounded-lg border border-[#e8e4dc] bg-[#faf9f0] p-5">
              <p className="font-medium text-[#1a1a1a]">BitBit</p>
              <p className="mt-1">Operated by All Webbed Up</p>
              <p className="mt-1">Australia</p>
              <p className="mt-3">
                Email: <a href="mailto:legal@bitbit.chat" className="text-[#d97757] underline decoration-[#d97757]/30 hover:decoration-[#d97757]">legal@bitbit.chat</a>
              </p>
              <p className="mt-1">
                Website: <a href="https://bitbit.chat" className="text-[#d97757] underline decoration-[#d97757]/30 hover:decoration-[#d97757]">bitbit.chat</a>
              </p>
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
