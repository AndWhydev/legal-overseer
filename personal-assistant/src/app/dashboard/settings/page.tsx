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

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPrefs, setIsSavingPrefs] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
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
