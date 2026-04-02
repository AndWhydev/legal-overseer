'use client'

import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { GraphNode } from './graph-types'
import type { RevealPerson, RevealProject, RevealFinancial } from '@/lib/onboarding/stream-types'

interface GraphDetailPanelProps {
  node: GraphNode
  onClose: () => void
  onCorrection?: (nodeId: string, field: string, value: string) => void
}

export function GraphDetailPanel({ node, onClose, onCorrection }: GraphDetailPanelProps) {
  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="border-l bg-background overflow-y-auto"
    >
      <div className="p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Badge variant="outline" className="mb-2 text-xs capitalize">
              {node.type}
            </Badge>
            <h3 className="text-sm font-medium">{node.label}</h3>
            {node.sublabel && (
              <p className="text-xs text-muted-foreground mt-0.5">{node.sublabel}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator />

        {/* Type-specific content */}
        {node.type === 'person' && <PersonDetail data={node.data as unknown as RevealPerson} />}
        {node.type === 'project' && <ProjectDetail data={node.data as unknown as RevealProject} />}
        {node.type === 'financial' && <FinancialDetail data={node.data as unknown as RevealFinancial} />}
        {node.type === 'user' && <UserDetail data={node.data as Record<string, unknown>} />}
      </div>
    </motion.div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  )
}

function PersonDetail({ data }: { data: RevealPerson }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Company" value={data.company} />
      <DetailRow label="Role" value={data.role} />
      <DetailRow label="Relationship" value={data.relationship} />
      <DetailRow label="Messages" value={String(data.messageCount)} />
      <DetailRow label="Frequency" value={data.frequency} />
      <DetailRow label="Last contact" value={data.lastInteraction} />
      {data.emails.length > 0 && (
        <DetailRow label="Email" value={data.emails[0]} />
      )}
      {data.outstandingItems.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Outstanding</div>
            {data.outstandingItems.map((item, i) => (
              <div key={i} className="text-sm text-muted-foreground mt-1">• {item}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProjectDetail({ data }: { data: RevealProject }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Status" value={data.status} />
      <DetailRow label="Description" value={data.description} />
      {data.people.length > 0 && (
        <DetailRow label="People" value={data.people.join(', ')} />
      )}
      {data.urls.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">URLs</div>
          {data.urls.map((url, i) => (
            <div key={i} className="text-sm text-blue-400 mt-0.5 break-all">{url}</div>
          ))}
        </div>
      )}
      {data.deadlines.length > 0 && (
        <DetailRow label="Deadlines" value={data.deadlines.join(', ')} />
      )}
    </div>
  )
}

function FinancialDetail({ data }: { data: RevealFinancial }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Type" value={data.type} />
      <DetailRow label="Entity" value={data.entity} />
      <DetailRow label="Amount" value={`${data.amount} ${data.currency}`} />
      <DetailRow label="Due date" value={data.dueDate} />
      <DetailRow label="Status" value={data.status} />
    </div>
  )
}

function UserDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="Name" value={data.name as string} />
      <DetailRow label="Business" value={data.businessName as string} />
      <DetailRow label="Role" value={data.role as string} />
    </div>
  )
}
