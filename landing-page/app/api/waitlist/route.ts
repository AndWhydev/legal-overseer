import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist_signups`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email, source: "landing-page" }),
    });

    if (res.status === 409 || res.status === 23505) {
      return NextResponse.json({ ok: true, message: "Already signed up." });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // Unique constraint violation (duplicate email)
      if (err?.code === "23505") {
        return NextResponse.json({ ok: true, message: "Already signed up." });
      }
      return NextResponse.json({ error: "Failed to save." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
