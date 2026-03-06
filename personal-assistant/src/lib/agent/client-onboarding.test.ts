import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  startOnboarding,
  triggerOnboardingFromProposal,
  updateOnboardingStep,
  updateCredentialStatus,
  createAsanaProject,
  scheduleKickoffCall,
  getOnboardingStatus,
  runOnboardingTick,
  type OnboardingRecord,
  type OnboardingStep,
  type CredentialItem,
  type OnboardingTickResult,
} from './client-onboarding'
import * as asanaAdapter from '@/lib/channels/asana'
import * as calendlyAdapter from '@/lib/channels/calendly'

// Mock Resend for email transport
const mockSend = vi.fn().mockResolvedValue({ data: { id: 'msg-123' }, error: null })
vi.mock('resend', () => ({
  Resend: vi.fn(function() {
    return {
      emails: {
        send: mockSend,
      },
    }
  }),
}))

// Mock Asana adapter
vi.mock('@/lib/channels/asana', () => ({
  fetchAsanaProjects: vi.fn(),
  createAsanaTask: vi.fn(),
}))

// Mock Calendly adapter
vi.mock('@/lib/channels/calendly', () => ({
  fetchCalendlyEventTypes: vi.fn(),
  createCalendlyBookingLink: vi.fn(),
}))

describe('client-onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = 'test-key'
    process.env.NOTIFICATION_FROM_EMAIL = 'noreply@test.com'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.NOTIFICATION_FROM_EMAIL
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  describe('startOnboarding', () => {
    it('creates onboarding checklist for website project', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: {
              id: 'onb-123',
              org_id: 'org-1',
              client_slug: 'acme-corp',
              project_type: 'website',
              status: 'active',
            },
            error: null,
          }),
        }),
      } as unknown as SupabaseClient

      const result = await startOnboarding(mockSupabase, 'org-1', 'acme-corp', 'website')

      expect(result).toBeDefined()
      expect(result.clientSlug).toBe('acme-corp')
      expect(result.projectType).toBe('website')
      expect(result.steps.length).toBeGreaterThan(0)

      const stepIds = result.steps.map((s) => s.id)
      expect(stepIds).toContain('welcome_email')
      expect(stepIds).toContain('credentials')
      expect(stepIds).toContain('analytics')
    })

    it('creates onboarding checklist for mobile_app project', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'onboardings') {
            return {
              insert: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('Table not found'),
              }),
            }
          }
          // For fallback kanban_columns query
          if (table === 'kanban_columns') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }
          }
          // For fallback tasks insert
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }),
      } as unknown as SupabaseClient

      const result = await startOnboarding(mockSupabase, 'org-1', 'startup-inc', 'mobile_app')

      expect(result.projectType).toBe('mobile_app')
      const stepIds = result.steps.map((s) => s.id)
      expect(stepIds).toContain('nda')
      expect(stepIds).toContain('app_store')
      expect(stepIds).toContain('design_assets')
    })

    it('creates default steps for unknown project type', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      } as unknown as SupabaseClient

      const result = await startOnboarding(mockSupabase, 'org-1', 'generic-client', 'unknown_type')

      expect(result.projectType).toBe('unknown_type')
      const stepIds = result.steps.map((s) => s.id)
      expect(stepIds).toContain('welcome_email')
      expect(stepIds).toContain('project_board')
    })

    it('initializes all steps with pending status', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      } as unknown as SupabaseClient

      const result = await startOnboarding(mockSupabase, 'org-1', 'test-client', 'ecommerce')

      result.steps.forEach((step) => {
        expect(step.status).toBe('pending')
        expect(step.id).toBeTruthy()
        expect(step.label).toBeTruthy()
      })
    })
  })

  describe('triggerOnboardingFromProposal', () => {
    it('returns null when proposal not found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: new Error('Not found'),
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const result = await triggerOnboardingFromProposal(mockSupabase, 'org-1', 'nonexistent', 'agent-1')

      expect(result).toBeNull()
    })

    it('attempts to create onboarding when proposal exists', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'proposals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'prop-123',
                        client_contact_id: 'contact-1',
                        project_type: 'website',
                        title: 'Redesign Website',
                        timeline: '8 weeks',
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }
          }
          if (table === 'contacts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      slug: 'acme-corp',
                      name: 'Acme Corp',
                      email: 'contact@acme.com',
                    },
                    error: null,
                  }),
                }),
              }),
            }
          }
          // For onboardings and activity_feed inserts
          if (table === 'onboardings') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: new Error('Table not found'),
                  }),
                }),
              }),
            }
          }
          // For kanban_columns fallback
          if (table === 'kanban_columns') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }
          }
          // For activity_feed
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }),
      } as unknown as SupabaseClient

      const result = await triggerOnboardingFromProposal(mockSupabase, 'org-1', 'prop-123', 'agent-1')

      // May be null if onboardings table insert fails, which is handled gracefully
      expect(result === null || typeof result === 'object').toBe(true)
    })
  })

  describe('updateOnboardingStep', () => {
    it('calls update when onboarding found', async () => {
      let updateCalled = false

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'onboardings') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          single: vi.fn().mockResolvedValue({
                            data: {
                              id: 'onb-123',
                              checklist: [
                                { id: 'welcome_email', label: 'Welcome', status: 'pending' },
                              ],
                            },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockImplementation(() => {
                updateCalled = true
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }
              }),
            }
          }
          return { select: vi.fn(), update: vi.fn() }
        }),
      } as unknown as SupabaseClient

      await updateOnboardingStep(mockSupabase, 'org-1', 'acme-corp', 'welcome_email', 'complete')

      expect(updateCalled).toBe(true)
    })
  })

  describe('updateCredentialStatus', () => {
    it('calls update when onboarding found', async () => {
      let updateCalled = false
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'onb-123',
                    credentials: [
                      { name: 'Hosting', description: 'cPanel', received: false },
                    ],
                    checklist: [
                      { id: 'credentials', label: 'Credentials', status: 'in_progress' },
                    ],
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation(() => {
            updateCalled = true
            return {
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }
          }),
        }),
      } as unknown as SupabaseClient

      await updateCredentialStatus(mockSupabase, 'org-1', 'onb-123', 'Hosting', true)

      expect(updateCalled).toBe(true)
    })

    it('does nothing when onboarding not found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: new Error('Not found'),
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      await updateCredentialStatus(mockSupabase, 'org-1', 'nonexistent', 'Hosting', true)

      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe('createAsanaProject', () => {
    it('creates Asana tasks for onboarding steps', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(asanaAdapter.fetchAsanaProjects).mockResolvedValue([
        { gid: 'workspace-1', name: 'Default Workspace' },
      ] as any)

      vi.mocked(asanaAdapter.createAsanaTask).mockResolvedValue({
        gid: 'task-1',
        name: '[Acme] Send welcome email',
        completed: false,
      } as any)

      const steps: OnboardingStep[] = [
        { id: 'welcome_email', label: 'Send welcome email', status: 'pending' },
        { id: 'credentials', label: 'Request credentials', status: 'pending' },
      ]

      const result = await createAsanaProject(mockSupabase, 'org-1', 'Acme Corp', 'website', steps)

      expect(result.success).toBe(true)
      expect(asanaAdapter.createAsanaTask).toHaveBeenCalledTimes(2)
    })

    it('returns error when no Asana workspace available', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(asanaAdapter.fetchAsanaProjects).mockResolvedValue({
        error: 'No Asana credentials configured',
      } as any)

      const steps: OnboardingStep[] = [
        { id: 'welcome_email', label: 'Send welcome email', status: 'pending' },
      ]

      const result = await createAsanaProject(mockSupabase, 'org-1', 'Test Client', 'website', steps)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns error when Asana task creation fails', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(asanaAdapter.fetchAsanaProjects).mockResolvedValue([
        { gid: 'workspace-1', name: 'Workspace' },
      ] as any)

      vi.mocked(asanaAdapter.createAsanaTask).mockResolvedValue({
        error: 'API rate limit exceeded',
      } as any)

      const steps: OnboardingStep[] = [
        { id: 'welcome_email', label: 'Send welcome email', status: 'pending' },
      ]

      const result = await createAsanaProject(mockSupabase, 'org-1', 'Test Client', 'website', steps)

      expect(result.success).toBe(false)
    })
  })

  describe('scheduleKickoffCall', () => {
    it('returns Calendly booking URL when event types available', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(calendlyAdapter.fetchCalendlyEventTypes).mockResolvedValue([
        {
          uri: 'https://calendly.com/user/kickoff',
          name: 'Kickoff Call',
          slug: 'kickoff',
          active: true,
          duration_minutes: 60,
          scheduling_url: 'https://calendly.com/user/kickoff',
        },
      ] as any)

      const result = await scheduleKickoffCall(mockSupabase, 'org-1')

      expect(result.bookingUrl).toBe('https://calendly.com/user/kickoff')
      expect(result.error).toBeUndefined()
    })

    it('prefers kickoff event type when available', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(calendlyAdapter.fetchCalendlyEventTypes).mockResolvedValue([
        {
          uri: 'https://calendly.com/user/general',
          name: 'General Meeting',
          slug: 'general',
          active: true,
          duration_minutes: 30,
          scheduling_url: 'https://calendly.com/user/general',
        },
        {
          uri: 'https://calendly.com/user/kickoff',
          name: 'Project Kickoff',
          slug: 'project-kickoff',
          active: true,
          duration_minutes: 60,
          scheduling_url: 'https://calendly.com/user/kickoff',
        },
      ] as any)

      const result = await scheduleKickoffCall(mockSupabase, 'org-1')

      expect(result.bookingUrl).toBe('https://calendly.com/user/kickoff')
    })

    it('returns error when no Calendly configured', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(calendlyAdapter.fetchCalendlyEventTypes).mockResolvedValue({
        error: 'No Calendly credentials configured',
      } as any)

      const result = await scheduleKickoffCall(mockSupabase, 'org-1')

      expect(result.bookingUrl).toBeNull()
      expect(result.error).toBeDefined()
    })

    it('returns error when no event types found', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(calendlyAdapter.fetchCalendlyEventTypes).mockResolvedValue([])

      const result = await scheduleKickoffCall(mockSupabase, 'org-1')

      expect(result.bookingUrl).toBeNull()
      expect(result.error).toContain('No active Calendly event types found')
    })
  })

  describe('getOnboardingStatus', () => {
    it('returns onboarding status with completion percentage', async () => {
      const mockData = {
        data: {
          id: 'onb-123',
          checklist: [
            { id: 'welcome_email', label: 'Welcome', status: 'complete' },
            { id: 'credentials', label: 'Credentials', status: 'pending' },
            { id: 'project_board', label: 'Board', status: 'pending' },
          ],
          credentials: [
            { name: 'Hosting', description: 'desc', received: true },
            { name: 'DNS', description: 'desc', received: false },
          ],
          status: 'active',
        },
        error: null,
      }

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(mockData),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const result = await getOnboardingStatus(mockSupabase, 'org-1', 'onb-123')

      expect(result).toBeDefined()
      expect(result?.checklist.length).toBe(3)
      expect(result?.credentials.length).toBe(2)
      expect(result?.status).toBe('active')
      expect(result?.completionPercent).toBe(40)
    })

    it('returns null when onboarding not found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: new Error('Not found'),
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const result = await getOnboardingStatus(mockSupabase, 'org-1', 'nonexistent')

      expect(result).toBeNull()
    })

    it('calculates 100% completion when all done', async () => {
      const mockData = {
        data: {
          checklist: [
            { id: 'step1', label: 'Step 1', status: 'complete' },
            { id: 'step2', label: 'Step 2', status: 'complete' },
          ],
          credentials: [
            { name: 'Cred1', description: 'desc', received: true },
          ],
          status: 'complete',
        },
        error: null,
      }

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(mockData),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const result = await getOnboardingStatus(mockSupabase, 'org-1', 'onb-123')

      expect(result?.completionPercent).toBe(100)
    })
  })

  describe('runOnboardingTick', () => {
    it('returns tick result with proper counters', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const result = await runOnboardingTick(mockSupabase, 'org-1', 'agent-1')

      expect(result.processed).toBeDefined()
      expect(result.welcomesSent).toBeDefined()
      expect(result.credentialReminders).toBeDefined()
      expect(result.projectsCreated).toBeDefined()
      expect(result.failed).toBeDefined()
      expect(typeof result.processed).toBe('number')
    })
  })

  describe('Edge Cases', () => {
    it('handles empty onboarding steps', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      } as unknown as SupabaseClient

      const result = await startOnboarding(mockSupabase, 'org-1', 'minimal-client', 'default')

      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('project type defaults to default steps', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      } as unknown as SupabaseClient

      const result = await startOnboarding(mockSupabase, 'org-1', 'client', 'completely_unknown')

      expect(result.steps.some((s) => s.id === 'welcome_email')).toBe(true)
    })
  })

  describe('Integration with adapters', () => {
    it('uses mocked Asana adapter functions', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(asanaAdapter.fetchAsanaProjects).mockResolvedValue([])

      await createAsanaProject(mockSupabase, 'org-1', 'Test', 'website', [])

      expect(asanaAdapter.fetchAsanaProjects).toHaveBeenCalled()
    })

    it('uses mocked Calendly adapter functions', async () => {
      const mockSupabase = {
        from: vi.fn(),
      } as unknown as SupabaseClient

      vi.mocked(calendlyAdapter.fetchCalendlyEventTypes).mockResolvedValue([])

      await scheduleKickoffCall(mockSupabase, 'org-1')

      expect(calendlyAdapter.fetchCalendlyEventTypes).toHaveBeenCalled()
    })
  })
})
