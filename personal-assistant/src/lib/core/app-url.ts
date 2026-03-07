/**
 * Returns the application URL. In production, requires NEXT_PUBLIC_APP_URL to be set.
 * In development, falls back to http://localhost:3000.
 */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (url) return url

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL environment variable is required in production')
  }

  return 'http://localhost:3000'
}
