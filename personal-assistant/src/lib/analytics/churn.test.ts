import { describe, it, expect } from 'vitest'
import { generateRetentionActions, type ChurnRiskOrg } from './churn'


describe('generateRetentionActions', () => {
  it('generates account_review for high-risk orgs (>= 70)', () => {
    const risks: ChurnRiskOrg[] = [
      {
        orgId: 'org-1',
        orgName: 'Critical Risk',
        riskScore: 85,
        signals: [
          {
            type: 'failed_payment',
            description: 'Subscription past due',
            weight: 40,
          },
          {
            type: 'no_login',
            description: 'No login recorded',
            weight: 45,
          },
        ],
        lastActivity: null,
        plan: 'growth',
      },
    ]

    const actions = generateRetentionActions(risks)

    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({
      orgId: 'org-1',
      action: 'account_review',
      reason: expect.stringContaining('High churn risk (85)'),
      priority: 'high',
    })
  })

  it('generates feature_highlight for medium-risk with low_usage', () => {
    const risks: ChurnRiskOrg[] = [
      {
        orgId: 'org-1',
        orgName: 'Medium Risk',
        riskScore: 55,
        signals: [
          {
            type: 'low_usage',
            description: 'Only 2 agent actions in 30 days',
            weight: 35,
          },
          {
            type: 'no_login',
            description: 'No login in 15 days',
            weight: 25,
          },
        ],
        lastActivity: null,
        plan: 'starter',
      },
    ]

    const actions = generateRetentionActions(risks)

    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe('feature_highlight')
    expect(actions[0].priority).toBe('medium')
  })

  it('generates email_checkin for medium-risk without low_usage', () => {
    const risks: ChurnRiskOrg[] = [
      {
        orgId: 'org-1',
        orgName: 'Medium Risk',
        riskScore: 55,
        signals: [
          {
            type: 'no_login',
            description: 'No login in 20 days',
            weight: 30,
          },
          {
            type: 'declining_engagement',
            description: 'Activity dropped 60%',
            weight: 25,
          },
        ],
        lastActivity: null,
        plan: 'starter',
      },
    ]

    const actions = generateRetentionActions(risks)

    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe('email_checkin')
    expect(actions[0].priority).toBe('medium')
  })

  it('generates email_checkin for low-risk orgs (25-50)', () => {
    const risks: ChurnRiskOrg[] = [
      {
        orgId: 'org-1',
        orgName: 'Low Risk',
        riskScore: 35,
        signals: [
          {
            type: 'low_usage',
            description: 'Only 4 agent actions',
            weight: 35,
          },
        ],
        lastActivity: null,
        plan: 'starter',
      },
    ]

    const actions = generateRetentionActions(risks)

    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe('email_checkin')
    expect(actions[0].priority).toBe('low')
  })

  it('skips orgs with risk score < 25', () => {
    const risks: ChurnRiskOrg[] = [
      {
        orgId: 'org-1',
        orgName: 'Very Low Risk',
        riskScore: 20,
        signals: [],
        lastActivity: null,
        plan: 'growth',
      },
    ]

    const actions = generateRetentionActions(risks)

    expect(actions).toHaveLength(0)
  })

  it('generates actions for multiple orgs', () => {
    const risks: ChurnRiskOrg[] = [
      {
        orgId: 'org-1',
        orgName: 'High Risk',
        riskScore: 75,
        signals: [{ type: 'failed_payment', description: 'Past due', weight: 75 }],
        lastActivity: null,
        plan: 'growth',
      },
      {
        orgId: 'org-2',
        orgName: 'Medium Risk',
        riskScore: 50,
        signals: [{ type: 'low_usage', description: 'Low usage', weight: 50 }],
        lastActivity: null,
        plan: 'starter',
      },
    ]

    const actions = generateRetentionActions(risks)

    expect(actions).toHaveLength(2)
    expect(actions[0].priority).toBe('high')
    expect(actions[1].priority).toBe('medium')
  })
})
