export function buildMagicLinkOtpRequest(
  supabaseUrl: string,
  email: string,
  redirectTo?: string,
) {
  const url = new URL('/auth/v1/otp', supabaseUrl)

  if (redirectTo) {
    url.searchParams.set('redirect_to', redirectTo)
  }

  return {
    url: url.toString(),
    body: {
      email,
      create_user: false,
      data: {},
      gotrue_meta_security: {},
    },
  }
}
