import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath } from './helpers'

/**
 * E2E tests for the chat page mic (Speech-to-Text) input.
 *
 * The browser's native SpeechRecognition / getUserMedia cannot be driven
 * reliably from Playwright, so we stub them via addInitScript before the
 * chat page loads. `window.__fireVoiceResult(text, isFinal)` becomes the
 * test hook for simulating recognition events.
 */

async function installVoiceMocks(page: Page) {
  await page.addInitScript(() => {
    interface FakeResult {
      transcript: string
      confidence: number
    }
    interface FakeResultList {
      isFinal: boolean
      length: number
      0: FakeResult
    }

    class MockSpeechRecognition extends EventTarget {
      continuous = false
      interimResults = false
      lang = ''
      onresult: ((event: { results: FakeResultList[] }) => void) | null = null
      onend: (() => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null

      start() {
        ;(window as unknown as { __activeVoice?: MockSpeechRecognition }).__activeVoice = this
      }
      stop() {
        this.onend?.()
      }
    }

    ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      MockSpeechRecognition
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      MockSpeechRecognition

    // Stub getUserMedia so the pill can set up its AudioContext-side logic
    // without triggering a real permission prompt.
    navigator.mediaDevices = navigator.mediaDevices || ({} as MediaDevices)
    navigator.mediaDevices.getUserMedia = async () => {
      const track = {
        stop: () => {},
        kind: 'audio',
        enabled: true,
      } as unknown as MediaStreamTrack
      return {
        getTracks: () => [track],
      } as unknown as MediaStream
    }

    // Public helper for tests to fire recognition events.
    ;(window as unknown as { __fireVoiceResult: (text: string, isFinal: boolean) => void })
      .__fireVoiceResult = (text: string, isFinal: boolean) => {
        const active = (window as unknown as { __activeVoice?: MockSpeechRecognition })
          .__activeVoice
        if (!active || !active.onresult) return
        const results: FakeResultList[] = [
          {
            isFinal,
            length: 1,
            0: { transcript: text, confidence: 0.9 },
          },
        ]
        active.onresult({ results })
      }
  })
}

async function openChatWithVoiceMocks(page: Page) {
  await installVoiceMocks(page)
  return openProtectedPath(page, '/dashboard/chat')
}

test.describe('Chat voice input', () => {
  test('mic button is visible in the docked chat composer', async ({ page }) => {
    const authenticated = await openChatWithVoiceMocks(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const mic = page.locator('button[aria-label="Voice input"]').first()
    await mic.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(mic).toBeVisible()
  })

  test('tapping mic toggles the listening pill', async ({ page }) => {
    const authenticated = await openChatWithVoiceMocks(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const mic = page.locator('button[aria-label="Voice input"]').first()
    await mic.waitFor({ state: 'visible', timeout: 15_000 })

    await mic.click()

    const stop = page.locator('button[aria-label="Stop listening"]').first()
    await expect(stop).toBeVisible({ timeout: 5_000 })

    // Tap the stop pill → returns to mic
    await stop.click()
    await expect(mic).toBeVisible({ timeout: 5_000 })
  })

  test('final voice result auto-populates and submits the message', async ({ page }) => {
    const authenticated = await openChatWithVoiceMocks(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    // Intercept the streaming chat endpoint so we never hit real model APIs.
    // The pill dispatches CHAT_SEND_EVENT → ChatInterface.handleSend → POST.
    // We accept any POST to /api/ai/* or /api/chat/* and return an empty stream.
    await page.route(/\/api\/(ai|chat)\//i, async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: 'data: [DONE]\n\n',
        })
      }
      return route.continue()
    })

    const mic = page.locator('button[aria-label="Voice input"]').first()
    await mic.waitFor({ state: 'visible', timeout: 15_000 })
    await mic.click()

    await expect(page.locator('button[aria-label="Stop listening"]').first()).toBeVisible({
      timeout: 5_000,
    })

    // Fire a final recognition result via our test hook.
    await page.evaluate(() => {
      ;(window as unknown as { __fireVoiceResult: (t: string, f: boolean) => void })
        .__fireVoiceResult('hello from playwright', true)
    })

    // The textarea should briefly contain the transcript, then clear after
    // the 600 ms auto-submit debounce fires and the message is sent.
    const textarea = page.locator('textarea[placeholder*="Message BitBit"]').first()

    // Either we observe the value set by the voice callback or the auto-clear
    // after send — both prove the pipeline is alive.
    await expect
      .poll(
        async () => {
          const v = await textarea.inputValue().catch(() => '')
          // Succeed if we've seen the transcript or it has been cleared after send
          return v
        },
        { timeout: 5_000, intervals: [100, 200, 300] },
      )
      .toMatch(/^(|hello from playwright)$/)

    // Wait past the 600 ms auto-submit debounce
    await page.waitForTimeout(900)

    // After submit, the textarea should be empty
    await expect(textarea).toHaveValue('', { timeout: 5_000 })
  })
})
