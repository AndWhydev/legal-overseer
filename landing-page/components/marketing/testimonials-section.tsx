const TESTIMONIALS = [
  {
    id: 1,
    avatar: "\u{1F468}\u200D\u{1F4BC}",
    name: "Marcus Reid",
    role: "Operations Director",
    company: "Digital Forward Agency",
    quote:
      "BitBit has cut our admin overhead by 60%. My team can now focus on client strategy instead of triaging emails all day.",
  },
  {
    id: 2,
    avatar: "\u{1F469}\u200D\u{1F4BC}",
    name: "Priya Menon",
    role: "Founder & CEO",
    company: "Momentum Ventures",
    quote:
      "The approval queue feature gives us the control we need while the AI handles the repetitive work. Best decision we made.",
  },
  {
    id: 3,
    avatar: "\u{1F468}\u200D\u{1F4BB}",
    name: "James Ko",
    role: "Operations Manager",
    company: "TechScale Consulting",
    quote:
      "Being able to remember context across 20+ Slack channels and email threads has transformed how we service our clients.",
  },
];

const METRICS = [
  { label: "500+", description: "Messages Processed" },
  { label: "99.9%", description: "Uptime" },
  { label: "20+", description: "Integrations" },
];

const PARTNERS = [
  { name: "Anthropic", icon: "\u{1F9E0}" },
  { name: "Supabase", icon: "\u{1F418}" },
  { name: "Vercel", icon: "\u26A1" },
  { name: "Stripe", icon: "\u{1F4B3}" },
  { name: "Pinecone", icon: "\u{1F50D}" },
];

export default function TestimonialsSection() {
  return (
    <section className="border-t border-[#e8e4dc] bg-[#f5f3ea] px-6 py-24">
      <div className="mx-auto max-w-5xl">
        {/* Section Header */}
        <div className="mb-20 text-center">
          <h2
            className="mb-4 text-[clamp(1.75rem,5vw,3rem)] tracking-[-0.02em] text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Loved by operations teams
          </h2>
          <p className="mx-auto max-w-lg text-base text-[#6b6560]">
            See what beta users are saying about BitBit.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="mb-20 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <div
              key={testimonial.id}
              className="flex flex-col rounded-lg border border-[#e8e4dc] bg-white p-8 transition-all hover:border-[#d4cfc6] hover:-translate-y-1"
            >
              <div className="mb-4 text-base text-[#FF5A1F]">
                {"\u2B50\u2B50\u2B50\u2B50\u2B50"}
              </div>

              <p className="mb-6 flex-1 text-base italic leading-relaxed text-[#1a1a1a]">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#FF5A1F]/20 bg-[#fff8f4] text-base">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[#1a1a1a]">
                    {testimonial.name}
                  </p>
                  <p className="text-[13px] text-[#6b6560]">
                    {testimonial.role} at {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Metrics Bar */}
        <div className="mb-20 grid gap-8 rounded-lg border border-[#FF5A1F]/10 bg-white px-8 py-10 text-center sm:grid-cols-3">
          {METRICS.map((metric) => (
            <div key={metric.label}>
              <div className="mb-2 text-base font-semibold text-[#FF5A1F]">
                {metric.label}
              </div>
              <div className="text-[13px] uppercase tracking-wide text-[#8b6f47]">
                {metric.description}
              </div>
            </div>
          ))}
        </div>

        {/* Partner Logos */}
        <div className="text-center">
          <p className="mb-6 text-[13px] uppercase tracking-wide text-[#8b6f47]">
            Built with trust from
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {PARTNERS.map((partner) => (
              <div
                key={partner.name}
                className="flex items-center gap-2 rounded-md border border-[#e8e4dc] bg-white px-4 py-2 text-[14px] font-medium text-[#1a1a1a] transition-colors hover:border-[#FF5A1F]/20 hover:bg-[#fff8f4]"
              >
                <span className="text-base">{partner.icon}</span>
                {partner.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
