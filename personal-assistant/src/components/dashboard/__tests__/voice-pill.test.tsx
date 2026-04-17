/* eslint-disable @typescript-eslint/no-require-imports -- vitest dynamic require() in test mock setup. */
// @vitest-environment jsdom
/**
 * Integration tests for <VoicePill> — the docked chat composer that hosts
 * the mic button and auto-submits voice transcripts to the chat send handler.
 *
 * We mock useVoiceInput to drive the pill's voice lifecycle deterministically
 * and mock useFileUpload to isolate the composer from upload plumbing.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

// ─── Mock hooks before importing the component ──────────────────────

type VoiceInputReturn = {
  isListening: boolean
  transcript: string
  isSupported: boolean
  frequencyData: Uint8Array | null
  error: string | null
  startListening: () => void
  stopListening: () => void
  toggleListening: () => void
  clearError: () => void
}

// The onResult callback is captured here so tests can fire simulated "final"
// transcripts at the pill exactly the way the real hook would.
let capturedOnResult: ((text: string) => void) | undefined

const voiceState: { current: VoiceInputReturn } = {
  current: {
    isListening: false,
    transcript: '',
    isSupported: true,
    frequencyData: null,
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    toggleListening: vi.fn(),
    clearError: vi.fn(),
  },
}

vi.mock('../../chat/use-voice-input', () => ({
  useVoiceInput: (onResult?: (text: string) => void) => {
    capturedOnResult = onResult
    return voiceState.current
  },
}))

const feedbackMocks = {
  onRecordStart: vi.fn(),
  onRecordStop: vi.fn(),
}

vi.mock('@/hooks/use-voice-feedback', () => ({
  useVoiceFeedback: () => feedbackMocks,
}))

vi.mock('@/hooks/use-file-upload', () => ({
  useFileUpload: () => ({
    uploads: [],
    addFiles: vi.fn(),
    removeUpload: vi.fn(),
    clearUploads: vi.fn(),
    readyAttachmentIds: [],
    isUploading: false,
  }),
}))

// CommandPalette is heavy and not part of voice behavior — stub it out.
vi.mock('../../chat/command-palette', () => ({
  CommandPalette: () => null,
  DEFAULT_CHAT_COMMANDS: [],
}))

// motion/react renders its own animation wrappers; strip motion-only props.
vi.mock('motion/react', () => {
  const React = require('react')
  const MOTION_PROPS = new Set([
    'initial',
    'animate',
    'exit',
    'transition',
    'whileHover',
    'whileTap',
    'layout',
    'layoutId',
    'variants',
  ])
  const passthrough = React.forwardRef(function M(
    props: { children?: React.ReactNode } & Record<string, unknown>,
    ref: React.Ref<HTMLDivElement>,
  ) {
    const { children, ...rest } = props
    const safeProps: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) {
      if (MOTION_PROPS.has(k)) continue
      safeProps[k] = v
    }
    return React.createElement('div', { ...safeProps, ref }, children)
  })
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: new Proxy(
      {},
      {
        get: () => passthrough,
      },
    ),
  }
})

// Now import the component under test
import { VoicePill } from '../voice-pill'

// ─── Default props helper ───────────────────────────────────────────

function renderPill(overrides: Partial<React.ComponentProps<typeof VoicePill>> = {}) {
  const onTextSubmit = vi.fn()
  const onDismiss = vi.fn()

  const result = render(
    <VoicePill
      mode="text"
      docked
      compactDocked
      morphing={false}
      morphPhase={null}
      morphShift={0}
      floatingAnchor={null}
      frequencyData={null}
      transcription={null}
      response={null}
      error={null}
      onTextSubmit={onTextSubmit}
      onDismiss={onDismiss}
      {...overrides}
    />,
  )

  return { ...result, onTextSubmit, onDismiss }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('<VoicePill> voice integration', () => {
  beforeEach(() => {
    voiceState.current = {
      isListening: false,
      transcript: '',
      isSupported: true,
      frequencyData: null,
      error: null,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      toggleListening: vi.fn(),
      clearError: vi.fn(),
    }
    capturedOnResult = undefined
    feedbackMocks.onRecordStart.mockClear()
    feedbackMocks.onRecordStop.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the mic button when voice input is supported', () => {
    renderPill()
    expect(screen.queryByLabelText('Voice input')).not.toBeNull()
  })

  it('hides the mic button when voice input is not supported', () => {
    voiceState.current.isSupported = false
    renderPill()
    expect(screen.queryByLabelText('Voice input')).toBeNull()
  })

  it('clicking the mic button calls voice.toggleListening', () => {
    renderPill()
    fireEvent.click(screen.getByLabelText('Voice input'))
    expect(voiceState.current.toggleListening).toHaveBeenCalledTimes(1)
  })

  it('renders the "stop listening" pill when isListening is true', () => {
    voiceState.current.isListening = true
    renderPill()
    expect(screen.queryByLabelText('Stop listening')).not.toBeNull()
    expect(screen.queryByLabelText('Voice input')).toBeNull()
  })

  it('shows the live transcript preview while listening', () => {
    voiceState.current.isListening = true
    voiceState.current.transcript = 'hello interim'
    renderPill()
    // Curly quotes are rendered; match the raw phrase.
    expect(screen.queryByText(/hello interim/)).not.toBeNull()
  })

  it('renders the error message when voice.error is set', () => {
    voiceState.current.error = 'Microphone access denied'
    renderPill()
    const alert = screen.getByTestId('voice-error')
    expect(alert.textContent).toContain('Microphone access denied')
    expect(alert.getAttribute('role')).toBe('alert')
  })

  it('auto-submits transcription after 600ms debounce when onResult fires', async () => {
    vi.useFakeTimers()
    const { onTextSubmit } = renderPill()

    // Sanity: hook was wired with a callback
    expect(typeof capturedOnResult).toBe('function')

    act(() => {
      capturedOnResult!('send this to the chat')
    })

    // Not submitted yet — waiting for the 600ms debounce
    expect(onTextSubmit).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(650)
    })

    expect(onTextSubmit).toHaveBeenCalledWith('send this to the chat')
  })

  it('auto-dismisses error after 3s by calling clearError', async () => {
    vi.useFakeTimers()
    voiceState.current.error = 'Microphone access denied'
    renderPill()

    expect(screen.queryByTestId('voice-error')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(voiceState.current.clearError).toHaveBeenCalled()
  })

  // ─── Polish: haptic feedback, cancel-on-type, a11y ─────────────────

  it('mic tap plays onRecordStart haptic cue when idle', () => {
    renderPill()
    fireEvent.click(screen.getByLabelText('Voice input'))
    expect(feedbackMocks.onRecordStart).toHaveBeenCalledTimes(1)
    expect(feedbackMocks.onRecordStop).not.toHaveBeenCalled()
  })

  it('stop tap plays onRecordStop haptic cue while listening', () => {
    voiceState.current.isListening = true
    renderPill()
    fireEvent.click(screen.getByLabelText('Stop listening'))
    expect(feedbackMocks.onRecordStop).toHaveBeenCalledTimes(1)
    expect(feedbackMocks.onRecordStart).not.toHaveBeenCalled()
  })

  it('mic button exposes aria-pressed reflecting listening state', () => {
    const { rerender } = renderPill()
    expect(screen.getByLabelText('Voice input').getAttribute('aria-pressed')).toBe('false')

    voiceState.current.isListening = true
    rerender(
      <VoicePill
        mode="text"
        docked
        compactDocked
        morphing={false}
        morphPhase={null}
        morphShift={0}
        floatingAnchor={null}
        frequencyData={null}
        transcription={null}
        response={null}
        error={null}
        onTextSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Stop listening').getAttribute('aria-pressed')).toBe('true')
  })

  it('live transcript preview is announced via aria-live=polite', () => {
    voiceState.current.isListening = true
    voiceState.current.transcript = 'hello world'
    renderPill()
    const preview = screen.getByText(/hello world/).closest('[aria-live]')
    expect(preview).not.toBeNull()
    expect(preview!.getAttribute('aria-live')).toBe('polite')
  })

  it('cancel-on-type: typing AFTER the voice result suppresses the submit entirely', async () => {
    vi.useFakeTimers()
    const { onTextSubmit } = renderPill()

    // Voice lands a final result
    act(() => {
      capturedOnResult!('hello from voice')
    })

    // User starts typing during the 600 ms debounce window
    const textarea = screen.getByPlaceholderText('Message BitBit...')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'hello from voice extra' } })
    })

    // Advance well past the debounce
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })

    // Nothing should have been auto-submitted — the user is now editing.
    expect(onTextSubmit).not.toHaveBeenCalled()

    // And the textarea should still show the user's composed value so they
    // can keep editing.
    expect((textarea as HTMLTextAreaElement).value).toBe('hello from voice extra')
  })
})
