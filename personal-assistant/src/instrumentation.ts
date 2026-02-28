export async function register() {
  // Validate environment variables on server startup
  const { validateEnv } = await import('@/lib/env-validator')
  validateEnv()
}
