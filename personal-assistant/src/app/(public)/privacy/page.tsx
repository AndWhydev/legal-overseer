import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | BitBit',
  description: 'BitBit Privacy Policy — how we collect, use, and protect your data',
}

const EFFECTIVE_DATE = '1 March 2026'

// ─────────────────────────────────────────────────────────────────────────────
// Sections marked [ADDED — BITBIT TEAM] were not in the original draft
// reviewed by counsel. They are flagged with amber AddedNote boxes below so
// the reviewing solicitor can compare them to the original draft and approve,
// amend, or remove as appropriate before this policy is published.
// ─────────────────────────────────────────────────────────────────────────────

function AddedNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 my-3 rounded-r text-amber-900 text-xs leading-relaxed">
      <span className="font-semibold">⚑ ADDED BY BITBIT TEAM — FOR LAWYER REVIEW:</span>{' '}
      {children}
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Effective: {EFFECTIVE_DATE}</p>

        <Section title="1. Who We Are">
          <p>
            BitBit Pty Ltd (ABN pending) (&quot;BitBit&quot;, &quot;we&quot;, &quot;us&quot;) operates
            an AI-powered personal and business operations platform. This policy explains how we
            collect, use, store, and protect your personal information in compliance with the
            Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).
          </p>
          <p>
            Where we process data of individuals in the European Economic Area, we also comply
            with the General Data Protection Regulation (GDPR).
          </p>
          <AddedNote>
            BitBit operates two products: <strong>Bit</strong> (a personal assistant for individuals
            and sole traders) and <strong>BitBit</strong> (a full AI operations platform for
            businesses and enterprises). This policy applies to both products. Where a provision
            applies only to one product it is noted accordingly. Lawyer to confirm whether a single
            policy adequately covers both products or whether separate policies are required.
          </AddedNote>
        </Section>

        <Section title="2. Information We Collect">
          <h3 className="font-medium mt-3 mb-1">Account Information</h3>
          <p>Name, email address, organisation name, billing address, and payment details (processed by Stripe).</p>

          <h3 className="font-medium mt-3 mb-1">Usage Data</h3>
          <p>
            Feature usage, agent invocations, token consumption, API call logs, and session
            analytics. We use this data to operate, improve, and bill for the Service.
          </p>

          <h3 className="font-medium mt-3 mb-1">Connected Channel Data</h3>
          <p>
            When you connect third-party channels (email, Asana, Calendly, Stripe, WhatsApp),
            we receive messages, events, and metadata from those services as authorised by you.
            This data is processed by AI agents to provide automation features.
          </p>

          <h3 className="font-medium mt-3 mb-1">AI-Processed Content</h3>
          <p>
            Content submitted to AI features (drafting, classification, analysis) is sent to
            Anthropic&apos;s Claude API for processing. Anthropic does not use API inputs for
            model training. See{' '}
            <a
              href="https://www.anthropic.com/privacy"
              className="text-blue-600 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anthropic&apos;s Privacy Policy
            </a>.
          </p>

          <AddedNote>
            <strong>Messaging Bridge Data.</strong> When you connect WhatsApp or Android Messages,
            your messages are routed through a dedicated bridge instance hosted on Fly.io infrastructure
            (see Section 6 — Third-Party Processors). When you connect iMessage, messages are routed
            through a dedicated Mac Virtual Private Server operated by LightNode. In both cases, message
            content transits through these bridge machines before being stored in your BitBit account
            database. Message content is encrypted in transit (TLS) and at rest (AES-256). Lawyer to
            confirm whether this cross-border transit requires additional disclosure under the APPs or
            GDPR cross-border transfer provisions.
          </AddedNote>

          <AddedNote>
            <strong>Contact Profiles and Entity Knowledge Graph.</strong> BitBit automatically builds
            a structured profile (&quot;Contact Profile&quot;) for each person who contacts you through
            a connected channel. These profiles include: name, contact details, communication history,
            inferred preferences, and a pre-computed knowledge summary (&quot;entity dossier&quot;)
            derived from your message history with that contact. This data is stored in your BitBit
            account database and used to power personalised, context-aware AI responses. You can view,
            correct, or delete Contact Profiles via the dashboard. Lawyer to review whether the
            automated profiling of third-party contacts (i.e. people who have not themselves signed up
            to BitBit) requires specific disclosure obligations under the APPs or GDPR Article 14
            (information to be provided where personal data has not been obtained from the data subject).
          </AddedNote>

          <AddedNote>
            <strong>Cross-Channel Identity Resolution.</strong> BitBit&apos;s systems may automatically
            link the same individual across multiple communication channels (e.g. recognising that an
            email sender and a WhatsApp contact are the same person, based on name, phone number, or
            email address matches). This cross-channel identity resolution is used to provide a unified
            view of each contact and to improve agent decision-making. Lawyer to advise whether this
            constitutes automated decision-making or profiling under GDPR Article 22 and whether any
            opt-out mechanism is required.
          </AddedNote>

          <AddedNote>
            <strong>Sensitive Information.</strong> BitBit does not specifically request or require
            sensitive information (as defined by the Privacy Act 1988 and APPs, including health
            information, biometric data, and financial account details beyond billing). However, because
            BitBit processes the content of messages sent and received through your connected channels,
            sensitive information may be incidentally present in message content (for example, health
            or medical details discussed with a client, or personal financial information shared by a
            contact). BitBit does not use incidentally received sensitive information for any purpose
            beyond delivering the requested AI feature. Users should avoid routing communications
            containing highly sensitive health or financial data through BitBit unless they have
            confirmed appropriate safeguards with us. Lawyer to advise on APP 3 (collection of
            sensitive information) obligations and whether explicit consent is required.
          </AddedNote>
        </Section>

        <Section title="3. AI Processing and Third-Party AI Services">
          <p>
            BitBit uses artificial intelligence to power its automation features including
            task classification, message drafting, lead scoring, and conversational agents.
          </p>

          <h3 className="font-medium mt-3 mb-1">How Your Data Is Processed by AI</h3>
          <p>
            When you use AI-powered features, your input (messages, task descriptions,
            channel data) is sent to <strong>Anthropic&apos;s Claude API</strong> for processing.
            This means your data <strong>transits through servers located in the United States</strong>,
            even though your primary database is hosted in Australia.
          </p>

          <h3 className="font-medium mt-3 mb-1">Data Usage by Anthropic</h3>
          <p>
            Under Anthropic&apos;s commercial API terms, <strong>Anthropic does not use your
            API inputs or outputs to train its models</strong>. Your data is processed
            solely to generate responses and is subject to Anthropic&apos;s data retention
            policies for API customers. See{' '}
            <a
              href="https://www.anthropic.com/privacy"
              className="text-blue-600 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anthropic&apos;s Privacy Policy
            </a>{' '}
            for details.
          </p>

          <h3 className="font-medium mt-3 mb-1">AI-Generated Content Disclaimer</h3>
          <p>
            Responses generated by AI features may contain inaccuracies. BitBit is a tool
            to assist your workflow -- it does not replace professional judgment. Always
            review AI-generated content before acting on it, particularly for financial,
            legal, or contractual matters.
          </p>

          <AddedNote>
            <strong>Embeddings and Vector Search.</strong> In addition to Anthropic, BitBit uses two
            further AI services to power semantic search and memory features: (1) <strong>OpenAI
            Embeddings API</strong> — your message content and document text is converted to numerical
            vector representations (&quot;embeddings&quot;) using OpenAI&apos;s text-embedding models
            (servers in the US); (2) <strong>Voyage AI Embeddings API</strong> — a second embeddings
            model used for code and technical content (servers in the US). These embeddings are stored
            in <strong>Pinecone</strong>, a vector database (servers in the US). Embeddings are
            mathematical representations of your data — they cannot be directly read as text — but they
            do encode semantic meaning and are derived from your content. Neither OpenAI, Voyage AI, nor
            Pinecone use your API data for model training under their commercial terms. Lawyer to confirm
            whether the transfer of content to these US-based processors requires Standard Contractual
            Clauses or other adequacy mechanisms under GDPR Chapter V.
          </AddedNote>

          <AddedNote>
            <strong>Web Search.</strong> When BitBit&apos;s AI agents perform web searches on your
            behalf (e.g. researching a prospect, finding information to complete a task), search
            queries are sent to the <strong>Brave Search API</strong> (servers in the US). Search
            queries may contain names, company names, or other identifying information derived from
            your context. Lawyer to advise whether search query data constitutes personal information
            and whether disclosure is adequate.
          </AddedNote>

          <AddedNote>
            <strong>Autonomous Agent Memory and Learning.</strong> BitBit maintains a persistent
            knowledge system (&quot;BitBit Baseplate&quot;) that pre-computes structured summaries of
            your contacts, conversations, and business context. This system updates automatically each
            time new messages are received. It is designed to allow BitBit agents to respond accurately
            and contextually without requiring you to re-explain background information. This constitutes
            automated processing of personal data to build a contextual model of your relationships and
            communications. You can request deletion of this stored context at any time via the
            dashboard or by contacting privacy@bitbit.au. Lawyer to review whether this memory system
            requires specific disclosure and consent under GDPR Article 13(2)(f) (automated
            decision-making) or APP 5 (notification of collection).
          </AddedNote>

          <AddedNote>
            <strong>Third-Party API Actions (Composio).</strong> BitBit uses <strong>Composio</strong>,
            an integration platform (servers in the US), to connect your account to third-party
            services (e.g. Google Workspace, Slack, CRM systems, accounting platforms). When you
            authorise a Composio-powered integration, your OAuth credentials and the data returned by
            those third-party services may transit through Composio&apos;s infrastructure. Composio
            acts as a sub-processor. See Composio&apos;s privacy policy at composio.dev for details.
            Lawyer to confirm whether Composio requires a data processing addendum and whether its
            inclusion in this processor table is sufficient.
          </AddedNote>
        </Section>

        <Section title="4. How We Use Your Information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Process payments and manage subscriptions.</li>
            <li>Send transactional emails (invoices, alerts, system notifications).</li>
            <li>Generate analytics and usage reports for your organisation.</li>
            <li>Detect and prevent fraud, abuse, or security incidents.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <AddedNote>
            <strong>Autonomous Agent Actions.</strong> BitBit AI agents may use your data to take
            actions on your behalf — including sending messages, creating calendar events, updating
            records in connected tools, and executing tasks through third-party integrations. These
            actions are taken based on your instructions and the authorisation levels you set within
            the platform. You are responsible for reviewing and configuring your agent&apos;s
            autonomy settings. Lawyer to advise whether automated processing for the purpose of
            taking real-world actions requires additional disclosure or consent beyond what is
            covered here and in the Terms of Service.
          </AddedNote>
        </Section>

        <Section title="5. Data Storage and Security">
          <p>
            Your primary account data is stored in Supabase-managed PostgreSQL databases in the
            <strong> ap-southeast-2 (Sydney, Australia)</strong> region. Data is encrypted at
            rest (AES-256) and in transit (TLS 1.3). Integration credentials are encrypted with
            AES-256-GCM before storage.
          </p>
          <p>
            We implement row-level security (RLS) policies to ensure strict tenant isolation.
            Each organisation&apos;s data is accessible only to authenticated members of that organisation.
          </p>
          <AddedNote>
            <strong>Bridge Infrastructure Data Residency.</strong> When you connect WhatsApp or
            Android Messages, a dedicated bridge instance is provisioned on <strong>Fly.io</strong>
            infrastructure. Fly.io machines may be deployed in regions outside Australia (including
            the US and Europe) depending on capacity and routing requirements. Message content transits
            through these machines before being stored in your Australian-region database. When you
            connect iMessage, your messages transit through a dedicated Mac Virtual Private Server
            operated by <strong>LightNode</strong>. The data residency of LightNode Mac VPS instances
            is [location to be confirmed by Tor Kay — engineer]. Lawyer to advise whether this
            cross-border transit of message content requires disclosure under APP 8 (cross-border
            disclosure) and/or GDPR Article 46, and whether Standard Contractual Clauses are required
            with Fly.io and LightNode.
          </AddedNote>
          <AddedNote>
            <strong>Cloudflare.</strong> BitBit uses <strong>Cloudflare</strong> for DNS resolution,
            DDoS protection, and encrypted tunnels used by bridge infrastructure. Traffic to and from
            BitBit services may transit Cloudflare&apos;s global network, which includes servers
            outside Australia. Cloudflare does not store your application data. See Cloudflare&apos;s
            privacy policy at cloudflare.com/privacypolicy for details.
          </AddedNote>
        </Section>

        <Section title="6. Third-Party Processors">
          <p className="mb-2 text-sm">
            The following third parties process personal data on our behalf:
          </p>
          <table className="w-full text-sm border-collapse mt-2">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">Processor</th>
                <th className="text-left py-2 pr-4">Purpose</th>
                <th className="text-left py-2">Location</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b"><td className="py-2 pr-4">Supabase</td><td className="pr-4">Database, auth, storage</td><td>Sydney, AU</td></tr>
              <tr className="border-b"><td className="py-2 pr-4">Anthropic</td><td className="pr-4">AI model inference</td><td>US</td></tr>
              <tr className="border-b"><td className="py-2 pr-4">Stripe</td><td className="pr-4">Payment processing</td><td>US / Global</td></tr>
              <tr className="border-b"><td className="py-2 pr-4">Vercel</td><td className="pr-4">Application hosting</td><td>Global CDN</td></tr>
              <tr className="border-b"><td className="py-2 pr-4">Sentry</td><td className="pr-4">Error monitoring</td><td>US</td></tr>
            </tbody>
          </table>
          <AddedNote>
            The following processors were not listed in the original draft and have been added by
            the BitBit team for lawyer review. Lawyer to confirm whether each processor requires
            a Data Processing Agreement (DPA), and whether their inclusion here satisfies disclosure
            obligations under APP 5 and GDPR Article 13(1)(e).

            <table className="w-full text-xs border-collapse mt-3">
              <thead>
                <tr className="border-b border-amber-400">
                  <th className="text-left py-2 pr-4">Processor</th>
                  <th className="text-left py-2 pr-4">Purpose</th>
                  <th className="text-left py-2">Location</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">Fly.io</td><td className="pr-4">Messaging bridge compute (WhatsApp, Android Messages)</td><td>US / Multi-region</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">LightNode</td><td className="pr-4">iMessage bridge (Mac VPS)</td><td>TBC</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">Cloudflare</td><td className="pr-4">DNS, DDoS protection, tunnels</td><td>Global</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">Resend</td><td className="pr-4">Transactional email delivery</td><td>US</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">Telnyx</td><td className="pr-4">SMS delivery</td><td>US</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">OpenAI</td><td className="pr-4">Text embeddings (semantic search)</td><td>US</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">Voyage AI</td><td className="pr-4">Text embeddings (technical content)</td><td>US</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">Pinecone</td><td className="pr-4">Vector database (embedding storage)</td><td>US</td></tr>
                <tr className="border-b border-amber-200"><td className="py-2 pr-4">Brave Search</td><td className="pr-4">Web search for AI agents</td><td>US</td></tr>
                <tr><td className="py-2 pr-4">Composio</td><td className="pr-4">Third-party API integration layer</td><td>US</td></tr>
              </tbody>
            </table>
          </AddedNote>
        </Section>

        <Section title="7. Data Retention">
          <ul className="list-disc pl-5 space-y-1">
            <li>Active account data: retained while your subscription is active.</li>
            <li>After cancellation: data available for export for 30 days, then deleted.</li>
            <li>Billing records: retained for 7 years per Australian tax law.</li>
            <li>Anonymised analytics: may be retained indefinitely.</li>
          </ul>
          <AddedNote>
            <strong>Financial Records — 7-Year Retention.</strong> In addition to billing records,
            any financial transaction records processed through BitBit (including invoices sent on your
            behalf, payment records received through connected accounting integrations, and related
            correspondence) are retained for a minimum of 7 years in compliance with the requirements
            of the Australian Taxation Administration Act 1953 and related legislation. These records
            are retained even after account cancellation. This retention obligation overrides any
            deletion request to the extent that the records are required by law to be retained. We
            will notify you of any such retention at the time you request deletion. Lawyer to confirm
            whether this financial records retention clause is adequately drafted and whether it
            should reference any specific regulations by name.
          </AddedNote>
          <AddedNote>
            <strong>Message Content and Contact Profiles.</strong> Message content processed by
            BitBit (including messages from WhatsApp, iMessage, Android Messages, and email) is
            retained while your account is active and for 30 days after cancellation, after which
            it is deleted. Contact Profiles (including entity dossiers generated by BitBit
            Baseplate) follow the same retention schedule. You may request earlier deletion of
            individual Contact Profiles at any time via the dashboard. Note: where financial
            correspondence is embedded in message content, the 7-year billing record retention
            obligation above may apply to that content. Lawyer to advise on the interaction
            between message content deletion rights and financial records retention obligations.
          </AddedNote>
          <AddedNote>
            <strong>Erasure Requests — Conflict with Retention Obligations.</strong> Where you
            exercise a right to erasure (under APP 11.2 or GDPR Article 17) and we are required
            by law to retain some or all of the relevant data, we will: (a) delete all data that
            we are not legally required to retain; (b) notify you in writing of the specific
            categories of data we are retaining and the legal basis for doing so; and (c) ensure
            that retained data is not used for any purpose other than compliance with the
            retention obligation. Lawyer to advise whether this approach satisfies the erasure
            obligation under both the APPs and GDPR.
          </AddedNote>
        </Section>

        <Section title="8. Your Rights">
          <p>Under the APPs (and GDPR where applicable), you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Access personal information we hold about you.</li>
            <li>Request correction of inaccurate information.</li>
            <li>Request deletion of your personal information.</li>
            <li>Export your data in a machine-readable format.</li>
            <li>Object to processing (GDPR) or withdraw consent.</li>
            <li>Lodge a complaint with the OAIC or relevant supervisory authority.</li>
          </ul>
          <p className="mt-2">
            To exercise these rights, email{' '}
            <a href="mailto:privacy@bitbit.au" className="text-blue-600 underline">privacy@bitbit.au</a>.
          </p>
          <AddedNote>
            <strong>Rights Relating to Automated Processing.</strong> Where BitBit uses automated
            processing (including AI agents) to make or assist in decisions that affect you or your
            contacts, you have the right to: (a) request a human review of any automated decision;
            (b) obtain an explanation of the logic applied; and (c) object to automated processing
            for profiling purposes. This right applies in particular to the Contact Profile and
            entity dossier system (BitBit Baseplate) and the autonomous agent confidence routing
            system (BitBit Gate). Lawyer to confirm whether this disclosure satisfies GDPR
            Article 22 requirements and whether equivalent rights should be stated under the APPs.
          </AddedNote>
          <AddedNote>
            <strong>Rights of Third-Party Contacts.</strong> BitBit processes personal information
            about individuals who contact you through your connected channels and who have not
            themselves signed up to BitBit. These individuals may have rights under the APPs
            and/or GDPR in relation to their personal information held in your BitBit account.
            BitBit is a data processor with respect to this data — you (the BitBit user) are the
            data controller. If a third-party contact asks to exercise their privacy rights,
            you are responsible for fulfilling that request. BitBit will provide tools to assist
            you in doing so. Lawyer to advise on whether BitBit has any direct obligations to
            third-party contacts and whether this data controller / data processor allocation
            is correctly stated.
          </AddedNote>
        </Section>

        <Section title="8A. International Data Transfers">
          <AddedNote>
            This is a new section added by the BitBit team. Lawyer to review whether this section
            is correctly placed and whether it adequately covers cross-border transfer obligations
            under APP 8 and GDPR Chapter V.
          </AddedNote>
          <p>
            BitBit transfers personal data to processors located outside Australia, including in
            the United States. These transfers occur when your data is processed by Anthropic
            (AI inference), OpenAI and Voyage AI (embeddings), Pinecone (vector storage), Vercel
            (application hosting), Fly.io (bridge compute), Resend (email), Telnyx (SMS), Brave
            Search (web search), and Composio (integrations).
          </p>
          <p className="mt-2">
            For users in the European Economic Area, transfers to the United States are made
            under Standard Contractual Clauses (SCCs) as approved by the European Commission,
            or another applicable transfer mechanism. A copy of the applicable transfer mechanism
            can be requested by emailing{' '}
            <a href="mailto:privacy@bitbit.au" className="text-blue-600 underline">privacy@bitbit.au</a>.
          </p>
          <p className="mt-2">
            For Australian users, BitBit takes reasonable steps to ensure that overseas recipients
            of personal information handle that information consistently with the Australian
            Privacy Principles, as required by APP 8.1. Where an overseas recipient cannot
            provide an equivalent level of protection, we rely on the exception in APP 8.2(b)
            and will notify you of this in the relevant product interface.
          </p>
          <AddedNote>
            Lawyer to confirm: (a) which APP 8.2 exception is most appropriate for each processor
            listed in Section 6; (b) whether SCCs are in place with each US-based processor or
            whether their existing DPAs/SCCs with Anthropic, Stripe, Vercel etc. are sufficient;
            (c) whether the reference to &quot;reasonable steps&quot; under APP 8.1 is sufficient
            or whether a more specific safeguard statement is required.
          </AddedNote>
        </Section>

        <Section title="9. Cookies">
          <p>
            We use essential cookies for authentication and session management. We do not use
            advertising or third-party tracking cookies. Analytics are collected server-side.
          </p>
        </Section>

        <Section title="10. Children">
          <p>
            The Service is not directed at individuals under 18. We do not knowingly collect
            personal information from children.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this policy from time to time. We will notify you via email at least
            14 days before material changes take effect.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Privacy Officer: <a href="mailto:privacy@bitbit.au" className="text-blue-600 underline">privacy@bitbit.au</a>
          </p>
          <p>
            Office of the Australian Information Commissioner:{' '}
            <a href="https://www.oaic.gov.au" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
              www.oaic.gov.au
            </a>
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
