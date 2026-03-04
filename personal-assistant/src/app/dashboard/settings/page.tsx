'use client'

import { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IntegrationGrid } from '@/components/integrations/integration-grid'

type Preferences = {
  autonomyLevel: 'low' | 'medium' | 'high'
  communicationStyle: 'concise' | 'balanced' | 'detailed'
  defaultEmailAction: 'draft' | 'send' | 'review'
}

const DEFAULT_PREFERENCES: Preferences = {
  autonomyLevel: 'medium',
  communicationStyle: 'concise',
  defaultEmailAction: 'draft',
}

type SubscriptionInfo = {
  plan: string
  status: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  daysRemaining: number | null
  features: {
    maxChannels: number
    maxLeads: number
    maxInvoicesPerMonth: number
    agents: string[]
    whatsapp: boolean
    proposals: boolean
    multiUser: boolean
    maxUsers?: number
  }
  canUpgrade: boolean
  nextTier: string | null
}

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  starter: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  growth: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  scale: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPrefs, setIsSavingPrefs] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [billing, setBilling] = useState<SubscriptionInfo | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings')
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'Failed to load settings')

        setDisplayName(body.profile.displayName ?? '')
        setEmail(body.profile.email ?? '')
        setPreferences(body.profile.preferences ?? DEFAULT_PREFERENCES)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to load settings')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  useEffect(() => {
    const loadBilling = async () => {
      try {
        const res = await fetch('/api/billing/subscription')
        if (res.ok) {
          const data = (await res.json()) as SubscriptionInfo
          setBilling(data)
        }
      } catch {
        // billing info is non-critical
      } finally {
        setBillingLoading(false)
      }
    }
    void loadBilling()
  }, [])

  const preferenceBadges = useMemo(
    () => ({
      autonomy: preferences.autonomyLevel.charAt(0).toUpperCase() + preferences.autonomyLevel.slice(1),
      communication:
        preferences.communicationStyle.charAt(0).toUpperCase() + preferences.communicationStyle.slice(1),
      emailAction:
        preferences.defaultEmailAction.charAt(0).toUpperCase() + preferences.defaultEmailAction.slice(1),
    }),
    [preferences]
  )

  const saveProfile = async () => {
    setIsSavingProfile(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to save profile')
      setDisplayName(body.profile.displayName)
      setMessage('Profile saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save profile')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const savePreferences = async () => {
    setIsSavingPrefs(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to save preferences')
      setPreferences(body.profile.preferences)
      setMessage('Preferences saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save preferences')
    } finally {
      setIsSavingPrefs(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card className="max-w-lg border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Your Profile</CardTitle>
              <CardDescription>Manage your account details.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Display Name</label>
                <Input value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={isLoading} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Email</label>
                <Input value={email} disabled />
              </div>
              <Button size="sm" className="w-fit" onClick={saveProfile} disabled={isLoading || isSavingProfile}>
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationGrid />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Card className="max-w-lg border-border/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Plan & Billing</CardTitle>
                {billing && (
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${PLAN_BADGE_COLORS[billing.plan] ?? PLAN_BADGE_COLORS.free}`}
                  >
                    {billing.plan}
                  </span>
                )}
              </div>
              <CardDescription>
                {billingLoading
                  ? 'Loading billing info...'
                  : !billing || billing.status === 'none'
                    ? 'Free tier — no billing'
                    : billing.status === 'trialing' && billing.trialEndsAt
                      ? `Trial ends ${new Date(billing.trialEndsAt).toLocaleDateString('en-AU', { month: 'long', day: 'numeric', year: 'numeric' })}`
                      : billing.currentPeriodEnd
                        ? `Renews on ${new Date(billing.currentPeriodEnd).toLocaleDateString('en-AU', { month: 'long', day: 'numeric', year: 'numeric' })}`
                        : 'Active subscription'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              {billing && (
                <>
                  <div className="flex flex-col gap-2 rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Channels</span>
                      <span className="font-medium">{billing.features.maxChannels === 99 ? 'Unlimited' : `Up to ${billing.features.maxChannels}`}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Leads</span>
                      <span className="font-medium">{billing.features.maxLeads >= 99999 ? 'Unlimited' : billing.features.maxLeads.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Invoices / month</span>
                      <span className="font-medium">{billing.features.maxInvoicesPerMonth >= 9999 ? 'Unlimited' : billing.features.maxInvoicesPerMonth}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {billing.daysRemaining !== null && (
                      <p className="text-xs text-muted-foreground">{billing.daysRemaining} days remaining</p>
                    )}
                    {billing.canUpgrade && billing.nextTier ? (
                      <Button size="sm" className="ml-auto" asChild>
                        <a href="/pricing">
                          Upgrade to {billing.nextTier.charAt(0).toUpperCase() + billing.nextTier.slice(1)}
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="ml-auto" asChild>
                        <a href="mailto:support@bitbit.com.au">Enterprise — contact us</a>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card className="max-w-lg border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Preferences</CardTitle>
              <CardDescription>Customize your assistant behavior.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Autonomy Level</p>
                  <p className="text-xs">How much the agent can do without asking</p>
                </div>
                <select
                  className="rounded border bg-background px-2 py-1 text-foreground"
                  value={preferences.autonomyLevel}
                  disabled={isLoading}
                  onChange={event =>
                    setPreferences(prev => ({ ...prev, autonomyLevel: event.target.value as Preferences['autonomyLevel'] }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Communication Style</p>
                  <p className="text-xs">Agent response verbosity</p>
                </div>
                <select
                  className="rounded border bg-background px-2 py-1 text-foreground"
                  value={preferences.communicationStyle}
                  disabled={isLoading}
                  onChange={event =>
                    setPreferences(prev => ({
                      ...prev,
                      communicationStyle: event.target.value as Preferences['communicationStyle'],
                    }))
                  }
                >
                  <option value="concise">Concise</option>
                  <option value="balanced">Balanced</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Default Email Action</p>
                  <p className="text-xs">What to do with outgoing emails</p>
                </div>
                <select
                  className="rounded border bg-background px-2 py-1 text-foreground"
                  value={preferences.defaultEmailAction}
                  disabled={isLoading}
                  onChange={event =>
                    setPreferences(prev => ({
                      ...prev,
                      defaultEmailAction: event.target.value as Preferences['defaultEmailAction'],
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="review">Review</option>
                  <option value="send">Send</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge variant="outline">{preferenceBadges.autonomy}</Badge>
                  <Badge variant="outline">{preferenceBadges.communication}</Badge>
                  <Badge variant="outline">{preferenceBadges.emailAction}</Badge>
                </div>
                <Button size="sm" onClick={savePreferences} disabled={isLoading || isSavingPrefs}>
                  {isSavingPrefs ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
