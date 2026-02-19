'use client'

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
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Integration } from '@/lib/integrations/types'

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

function ConnectButton({ status }: { status: Integration['status'] }) {
  switch (status) {
    case 'connected':
      return (
        <Button variant="outline" size="sm" className="shrink-0 text-xs">
          Configure
        </Button>
      )
    case 'available':
      return (
        <Button size="sm" className="shrink-0 text-xs">
          Connect
        </Button>
      )
    case 'coming_soon':
      return null
  }
}

export function IntegrationCard({ integration }: { integration: Integration }) {
  const Icon = ICON_MAP[integration.icon]
  const isComingSoon = integration.status === 'coming_soon'

  return (
    <Card
      className={`border-border/50 transition-colors ${
        isComingSoon
          ? 'opacity-60'
          : 'hover:border-border hover:bg-muted/30 cursor-pointer'
      }`}
    >
      <CardContent className="flex items-center gap-4">
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
            <StatusBadge status={integration.status} />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {integration.description}
          </p>
        </div>
        <ConnectButton status={integration.status} />
      </CardContent>
    </Card>
  )
}
