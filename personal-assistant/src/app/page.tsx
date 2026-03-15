// The marketing landing page is served via the (marketing) route group
// This is handled by (marketing)/page.tsx
// Redirect authenticated users to dashboard, unauthenticated to landing

import { redirect } from 'next/navigation'

export default function RootPage() {
  // Root page redirects to dashboard; middleware will handle auth checks
  redirect('/dashboard')
}

