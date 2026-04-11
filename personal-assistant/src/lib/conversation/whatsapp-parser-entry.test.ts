import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockHandleGatewayMessage } = vi.hoisted(() => ({
  mockHandleGatewayMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/channels/gateway-handler", () => ({
  handleGatewayMessage: mockHandleGatewayMessage,
}))

// Suppress resolveChannelIdentity — return null so fallback identity is used
vi.mock("@/lib/conversation/identity-resolver", () => ({
  resolveChannelIdentity: vi.fn().mockResolvedValue(null),
}))

import { processWhatsAppMessage } from "@/lib/channels/whatsapp-parser"

describe("processWhatsAppMessage entry behavior", () => {
  const mockSupabase = {} as any

  beforeEach(() => {
    mockHandleGatewayMessage.mockReset()
    mockHandleGatewayMessage.mockResolvedValue(undefined)
  })

  it("passes normalized text + sender to gateway handler", async () => {
    await processWhatsAppMessage(
      mockSupabase,
      "org-1",
      { sender_email: "+61411111111", sender: "Test User" },
      "invoice sezer for $200"
    )

    expect(mockHandleGatewayMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        text: "invoice sezer for $200",
        replyTo: "+61411111111",
        identity: expect.objectContaining({
          orgId: "org-1",
        }),
      })
    )
  })

  it("passes voice note text directly to gateway handler", async () => {
    await processWhatsAppMessage(
      mockSupabase,
      "org-1",
      { sender_email: "+61411111111", sender: "Test User", metadata: { voice_note: true } },
      "remind me to call bob tomorrow"
    )

    expect(mockHandleGatewayMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        text: "remind me to call bob tomorrow",
        replyTo: "+61411111111",
      })
    )
  })

  it("warns and does not dispatch when sender is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await processWhatsAppMessage(
        mockSupabase,
        "org-1",
        { metadata: { voice_note: true } },
        "hello"
      )
    } finally {
      expect(warnSpy).toHaveBeenCalled()
      const calls = warnSpy.mock.calls as any[][]
      expect(
        calls.some(
          (call) =>
            typeof call[0] === "string" &&
            call[0].includes("[whatsapp-parser] No phone number found in message row")
        )
      ).toBe(true)
      warnSpy.mockRestore()
    }

    expect(mockHandleGatewayMessage).not.toHaveBeenCalled()
  })
})
