import { describe, expect, it, vi } from 'vitest'

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('@/components/channels/channel-grid', () => ({
  ChannelGrid: () => null,
}))

describe('/dashboard/channels page', () => {
  it('redirects legacy channels URLs to the canonical connections route', async () => {
    const pageModule = await import('./page')

    expect(() => pageModule.default()).toThrowError('redirect:/dashboard/connections')
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/connections')
  })
})
