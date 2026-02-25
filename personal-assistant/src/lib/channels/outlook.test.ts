import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { outlookAdapter } from './outlook'

const MOCK_TOKEN = 'mock_access_token'

const MOCK_GRAPH_RESPONSE = {
    value: [
        {
            id: 'msg-123',
            conversationId: 'conv-123',
            sender: {
                emailAddress: {
                    name: 'Andy Smith',
                    address: 'andy@example.com'
                }
            },
            subject: 'Mock Email Subject',
            bodyPreview: 'This is a preview',
            body: {
                content: 'This is the full text body content'
            },
            receivedDateTime: '2026-02-23T06:00:00Z',
            isRead: false
        }
    ]
}

describe('outlookAdapter', () => {
    const originalEnv = process.env
    let fetchMock: any

    beforeEach(() => {
        vi.resetModules()
        process.env = { ...originalEnv }

        // Set mock env vars
        process.env.OUTLOOK_TENANT_ID = 'mock-tenant'
        process.env.OUTLOOK_CLIENT_ID = 'mock-client'
        process.env.OUTLOOK_CLIENT_SECRET = 'mock-secret'
        process.env.OUTLOOK_USER_ID = 'mock-user'

        fetchMock = vi.fn()
        global.fetch = fetchMock
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('reports unavailable when missing credentials', async () => {
        process.env.OUTLOOK_TENANT_ID = ''
        expect(await outlookAdapter.isAvailable()).toBe(false)
    })

    it('reports available when credentials exist', async () => {
        expect(await outlookAdapter.isAvailable()).toBe(true)
    })

    it('pulls messages successfully using MS Graph', async () => {
        // Mock the OAuth token request
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ access_token: MOCK_TOKEN })
        })

        // Mock the MS Graph Messages request
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(MOCK_GRAPH_RESPONSE)
        })

        const messages = await outlookAdapter.pull({})

        expect(messages).toHaveLength(1)
        expect(messages[0]).toMatchObject({
            id: 'outlook-msg-123',
            channel: 'outlook',
            sender: 'Andy Smith',
            senderEmail: 'andy@example.com',
            subject: 'Mock Email Subject',
            body: 'This is the full text body content'
        })

        // Verify OAuth fetch
        expect(fetchMock.mock.calls[0][0]).toContain('login.microsoftonline.com/mock-tenant')
        expect(fetchMock.mock.calls[0][1].body.toString()).toContain('client_id=mock-client')

        // Verify Graph fetch
        expect(fetchMock.mock.calls[1][0]).toContain('graph.microsoft.com')
        expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
            Authorization: `Bearer ${MOCK_TOKEN}`,
            Prefer: 'outlook.body-content-type="text"'
        })
    })

    it('handles auth failures gracefully', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            statusText: 'Unauthorized',
            status: 401
        })

        const messages = await outlookAdapter.pull({})
        expect(messages).toHaveLength(0)
    })
})
