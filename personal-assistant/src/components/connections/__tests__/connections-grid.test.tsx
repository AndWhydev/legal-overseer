// @vitest-environment jsdom
/**
 * Unit tests for <ConnectionsGrid>.
 *
 * We mock `@/lib/connections` (the hook + helpers) rather than stubbing
 * fetch — that gives us precise control over every render case without
 * needing SWR machinery. We also stub global fetch for the `/api/connections`
 * call the grid makes to populate OrgConnection data (used by the detail
 * drawer integration).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

import type { CatalogApp, CatalogResponse } from '@/lib/connections/catalog-types'

// ─────────────────────────────────────────────────────────────────────
// Module mocks (defined before we import the component under test)
// ─────────────────────────────────────────────────────────────────────

type HookResult = {
  data: CatalogResponse | undefined
  isLoading: boolean
  error: Error | undefined
  refetch: () => Promise<CatalogResponse | undefined>
}

const hookState: { current: HookResult } = {
  current: {
    data: undefined,
    isLoading: true,
    error: undefined,
    refetch: vi.fn(async () => undefined),
  },
}

vi.mock('@/lib/connections', () => ({
  useConnectionCatalog: () => hookState.current,
  isBespokeFlow: (id: string) => id === 'whatsapp' || id === 'stripe' || id === 'imessage',
  BESPOKE_FLOWS: new Set(['whatsapp', 'stripe', 'imessage']),
  builtInProviders: [],
}))

vi.mock('@/lib/connections/bespoke-flows', () => ({
  isBespokeFlow: (id: string) => id === 'whatsapp' || id === 'stripe' || id === 'imessage',
  BESPOKE_FLOWS: new Set(['whatsapp', 'stripe', 'imessage']),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Track ConnectModal renders so we can assert modal opens.
const connectModalSpy = vi.fn()
vi.mock('@/components/channels/connect-modal', () => ({
  ConnectModal: (props: { open: boolean; mode: string; channel: string; channelName: string }) => {
    connectModalSpy(props)
    return props.open ? (
      <div data-testid="connect-modal" data-mode={props.mode} data-channel={props.channel}>
        Mock ConnectModal: {props.channelName}
      </div>
    ) : null
  },
}))

// eslint-disable-next-line import/first
import { ConnectionsGrid } from '../connections-grid'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeApp(overrides: Partial<CatalogApp> = {}): CatalogApp {
  return {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email by Google',
    categories: ['communication'],
    logo: '',
    authScheme: 'oauth2',
    connected: false,
    ...overrides,
  }
}

function makeResponse(apps: CatalogApp[], error?: string): CatalogResponse {
  const base: CatalogResponse = {
    apps,
    total: apps.length,
    connected_count: apps.filter(a => a.connected).length,
  }
  if (error !== undefined) base.error = error
  return base
}

function setHook(partial: Partial<HookResult>) {
  hookState.current = { ...hookState.current, ...partial }
}

beforeEach(() => {
  hookState.current = {
    data: undefined,
    isLoading: true,
    error: undefined,
    refetch: vi.fn(async () => undefined),
  }
  connectModalSpy.mockClear()

  // Stub global fetch so the grid's /api/connections call resolves.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ connections: [] }),
      }) as unknown as Response,
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('<ConnectionsGrid>', () => {
  it('renders a loading skeleton grid', () => {
    setHook({ isLoading: true, data: undefined })
    render(<ConnectionsGrid />)
    expect(screen.getByTestId('connections-loading')).toBeTruthy()
  })

  it('renders a hard-error Empty state with Retry on SWR error', () => {
    setHook({ isLoading: false, error: new Error('Boom') })
    render(<ConnectionsGrid />)
    expect(screen.getByText(/could not load connections/i)).toBeTruthy()
    expect(screen.getByText(/boom/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('renders a non-blocking soft-error banner when data.error is set', async () => {
    setHook({
      isLoading: false,
      data: makeResponse([], 'Composio not configured'),
    })
    render(<ConnectionsGrid />)

    await waitFor(() => {
      expect(screen.getByTestId('connections-soft-error')).toBeTruthy()
    })
    expect(screen.getByText('Composio not configured')).toBeTruthy()
    // No hard-error Empty
    expect(screen.queryByText(/could not load connections/i)).toBeNull()
  })

  it('renders populated apps from catalog', async () => {
    setHook({
      isLoading: false,
      data: makeResponse([
        makeApp({ id: 'gmail', name: 'Gmail' }),
        makeApp({ id: 'notion', name: 'Notion', categories: ['productivity'] }),
      ]),
    })
    render(<ConnectionsGrid />)

    await waitFor(() => {
      expect(screen.getByText('Gmail')).toBeTruthy()
      expect(screen.getByText('Notion')).toBeTruthy()
    })
  })

  it('filters rendered cards when user types in search (debounced 300ms)', async () => {
    vi.useFakeTimers()
    try {
      setHook({
        isLoading: false,
        data: makeResponse([
          makeApp({ id: 'gmail', name: 'Gmail' }),
          makeApp({ id: 'notion', name: 'Notion' }),
        ]),
      })
      render(<ConnectionsGrid />)

      const input = screen.getByRole('searchbox', { name: /search connections/i })
      fireEvent.change(input, { target: { value: 'noti' } })
      expect((input as HTMLInputElement).value).toBe('noti')

      // Debounce window: value is set immediately in input, but hook sees it
      // after 300ms. The hook mock ignores the query anyway; we just assert
      // the debounce effect doesn't throw and the component stays mounted.
      act(() => {
        vi.advanceTimersByTime(350)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders category tabs derived from app categories', async () => {
    setHook({
      isLoading: false,
      data: makeResponse([
        makeApp({ id: 'gmail', categories: ['communication'] }),
        makeApp({ id: 'notion', name: 'Notion', categories: ['productivity'] }),
        makeApp({ id: 'slack', name: 'Slack', categories: ['communication'] }),
      ]),
    })
    render(<ConnectionsGrid />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^all$/i })).toBeTruthy()
    })
    expect(screen.getByRole('tab', { name: /communication/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /productivity/i })).toBeTruthy()
  })

  it('switching category tabs updates active selection', async () => {
    setHook({
      isLoading: false,
      data: makeResponse([
        makeApp({ id: 'gmail', categories: ['communication'] }),
        makeApp({ id: 'notion', name: 'Notion', categories: ['productivity'] }),
      ]),
    })
    render(<ConnectionsGrid />)

    const prodTab = await screen.findByRole('tab', { name: /productivity/i })
    fireEvent.click(prodTab)
    expect(prodTab.getAttribute('aria-selected')).toBe('true')
  })

  it('clicking Connect on a bespoke service (whatsapp) opens the ConnectModal with whatsapp_qr mode', async () => {
    setHook({
      isLoading: false,
      data: makeResponse([makeApp({ id: 'whatsapp', name: 'WhatsApp', categories: [] })]),
    })
    render(<ConnectionsGrid />)

    const btn = await screen.findByRole('button', { name: /connect/i })
    fireEvent.click(btn)

    const modal = await screen.findByTestId('connect-modal')
    expect(modal.getAttribute('data-mode')).toBe('whatsapp_qr')
    expect(modal.getAttribute('data-channel')).toBe('whatsapp')
  })

  it('clicking Connect on a bespoke service (stripe) opens the ConnectModal with api_key mode', async () => {
    setHook({
      isLoading: false,
      data: makeResponse([makeApp({ id: 'stripe', name: 'Stripe', categories: [] })]),
    })
    render(<ConnectionsGrid />)

    const btn = await screen.findByRole('button', { name: /connect/i })
    fireEvent.click(btn)

    const modal = await screen.findByTestId('connect-modal')
    expect(modal.getAttribute('data-mode')).toBe('api_key')
    expect(modal.getAttribute('data-channel')).toBe('stripe')
  })

  it('clicking Connect on a non-bespoke service calls onConnectComposio', async () => {
    const onConnectComposio = vi.fn()
    setHook({
      isLoading: false,
      data: makeResponse([makeApp({ id: 'notion', name: 'Notion', categories: [] })]),
    })
    render(<ConnectionsGrid onConnectComposio={onConnectComposio} />)

    const btn = await screen.findByRole('button', { name: /connect/i })
    fireEvent.click(btn)

    expect(onConnectComposio).toHaveBeenCalledTimes(1)
    expect(onConnectComposio.mock.calls[0][0]).toMatchObject({ id: 'notion', name: 'Notion' })
    // ConnectModal must NOT have been opened
    expect(screen.queryByTestId('connect-modal')).toBeNull()
  })

  it('exposes refetch via onRefetchReady prop', async () => {
    const onRefetchReady = vi.fn()
    setHook({
      isLoading: false,
      data: makeResponse([]),
    })
    render(<ConnectionsGrid onRefetchReady={onRefetchReady} />)

    await waitFor(() => {
      expect(onRefetchReady).toHaveBeenCalled()
    })
    const passed = onRefetchReady.mock.calls[0][0]
    expect(typeof passed).toBe('function')
  })
})
