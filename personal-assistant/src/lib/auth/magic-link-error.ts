type MagicLinkErrorResult = {
  status: number
  error: string
  retryAfterSeconds?: number
}

function parseRetryAfterSeconds(retryAfterHeader?: string | null): number | undefined {
  if (!retryAfterHeader) {
    return undefined
  }

  const parsed = Number.parseInt(retryAfterHeader, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

export function normalizeMagicLinkError(
  status: number,
  body: string,
  retryAfterHeader?: string | null,
): MagicLinkErrorResult {
  const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader)
  const normalizedBody = body.toLowerCase()
  const isRateLimited =
    status === 429 ||
    normalizedBody.includes('rate limit') ||
    normalizedBody.includes('too many requests') ||
    normalizedBody.includes('over_email_send_rate_limit')

  if (isRateLimited) {
    const waitSuffix = retryAfterSeconds
      ? ` Please wait about ${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds >= 120 ? 's' : ''} and try again.`
      : ' Please wait a bit and try again.'

    return {
      status: 429,
      error: `Too many sign-in emails have been requested.${waitSuffix}`,
      retryAfterSeconds,
    }
  }

  return {
    status: 500,
    error: 'Failed to send sign-in email',
  }
}
