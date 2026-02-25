'use client'

import { useState } from 'react'
import {
  Mail,
  Calendar,
  CheckSquare,
  Hash,
  FileText,
  Users,
  BarChart3,
  CreditCard,
  MessageSquare,
  Phone,
  MessageCircle,
  CalendarClock,
  Send,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Integration } from '@/lib/integrations/types'
import { getOAuthRedirectUrl } from '@/lib/integrations/oauth'

const ICON_MAP: Record<string, LucideIcon> = {
  Mail,
  Calendar,
  CheckSquare,
  Hash,
  FileText,
  Users,
  BarChart3,
  CreditCard,
  MessageSquare,
  Phone,
  MessageCircle,
  CalendarClock,
  Send,
}

function StatusBadge({ status }: { status: Integration['status'] }) {
  switch (status) {
    case 'connected':
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">
          Connected
        </Badge>
      )
    case 'available':
      return null // button handles this
    case 'coming_soon':
      return (
        <Badge variant="secondary" className="text-[10px]">
          Coming Soon
        </Badge>
      )
  }
}

function ConnectButton({
  integration,
  isConnected,
  onConnect,
  onDisconnect,
}: {
  integration: Integration
  isConnected: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  switch (integration.status) {
    case 'connected':
    case 'available':
      if (isConnected) {
        return (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs"
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        )
      }
      return (
        <Button
          size="sm"
          className="shrink-0 text-xs"
          onClick={onConnect}
        >
          Connect
        </Button>
      )
    case 'coming_soon':
      return null
  }
}

interface IntegrationCardProps {
  integration: Integration
  isConnected?: boolean
  onStatusChange?: () => void
}

export function IntegrationCard({
  integration,
  isConnected = false,
  onStatusChange,
}: IntegrationCardProps) {
  const Icon = ICON_MAP[integration.icon]
  const isComingSoon = integration.status === 'coming_soon'
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = () => {
    if (integration.authMethod === 'oauth') {
      try {
        const redirectUrl = getOAuthRedirectUrl(integration.id)
        window.location.href = redirectUrl
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'OAuth setup failed'
        console.error('OAuth error:', err)
        setError(message)
      }
    } else if (integration.authMethod === 'api_key') {
      setApiKeyDialogOpen(true)
    }
  }

  const handleApiKeySubmit = async () => {
    if (!apiKey.trim()) {
      setError('API key is required')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: integration.id,
          credentials: {
            api_key: apiKey,
          },
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error: string }
        throw new Error(data.error || 'Failed to connect')
      }

      setApiKeyDialogOpen(false)
      setApiKey('')
      onStatusChange?.()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Connection failed'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/settings/integrations', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: integration.id,
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error: string }
        throw new Error(data.error || 'Failed to disconnect')
      }

      onStatusChange?.()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Disconnection failed'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Card
        className={`border-border/50 transition-colors ${
          isComingSoon
            ? 'opacity-60'
            : 'hover:border-border hover:bg-muted/30'
        }`}
      >
        <CardContent className="flex items-center gap-4 p-4">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${integration.color}15` }}
          >
            {Icon && (
              <Icon
                className="size-5"
                style={{ color: integration.color }}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{integration.name}</span>
              {isConnected || integration.status === 'connected' ? (
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">
                  Connected
                </Badge>
              ) : integration.status === 'coming_soon' ? (
                <Badge variant="secondary" className="text-[10px]">
                  Coming Soon
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {integration.description}
            </p>
          </div>
          <ConnectButton
            integration={integration}
            isConnected={isConnected || integration.status === 'connected'}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </CardContent>
      </Card>

      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {integration.name}</DialogTitle>
            <DialogDescription>
              Enter your {integration.name} API key to connect this integration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <Input
              placeholder="Enter API key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isLoading}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setApiKeyDialogOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApiKeySubmit}
                disabled={isLoading || !apiKey.trim()}
              >
                {isLoading ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
