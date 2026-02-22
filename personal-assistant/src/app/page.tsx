import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20">
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-400">BitBit</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
          AI operations for agencies.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-neutral-300">
          Manage leads, approvals, invoicing, and channel workflows in one place.
          Sign in to access the production dashboard.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/login"
            className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-200"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-neutral-700 px-5 py-3 text-sm font-semibold text-white hover:border-neutral-500"
          >
            Open dashboard
          </Link>
        </div>
      </section>
    </main>
  )
}
