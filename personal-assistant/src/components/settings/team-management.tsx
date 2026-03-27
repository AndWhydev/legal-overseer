'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { IconCheck, IconTrash, IconLoader2 } from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { logger } from '@/lib/core/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  email: string
  display_name: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  created_at: string
}

interface TeamInvite {
  id: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  created_at: string
  expires_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { id: 'owner', label: 'Owner', desc: 'Full access and billing control' },
  { id: 'admin', label: 'Admin', desc: 'Full access except billing' },
  { id: 'member', label: 'Member', desc: 'Can view and edit content' },
  { id: 'viewer', label: 'Viewer', desc: 'Read-only access' },
] as const

// ─── Role Badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const variant = role === 'owner'
    ? 'default' as const
    : role === 'admin'
      ? 'secondary' as const
      : 'outline' as const

  return (
    <Badge variant={variant} className="capitalize">
      {role}
    </Badge>
  )
}

// ─── Team Management Component ────────────────────────────────────────────────

export function TeamManagementTab() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin' | 'viewer'>('member')
  const [isInviting, setIsInviting] = useState(false)

  const [saveIndicatorVisible, setSaveIndicatorVisible] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete' | 'role-change'
    memberId: string
    email: string
    newRole?: string
  } | null>(null)

  // Load team data
  useEffect(() => {
    const fetchTeam = async () => {
      try {
        setIsLoading(true)
        const res = await fetch('/api/team')
        if (!res.ok) throw new Error('Failed to fetch team')
        const data = await res.json() as { members: TeamMember[]; invites: TeamInvite[] }
        setMembers(data.members)
        setInvites(data.invites)
      } catch (err) {
        logger.error('Failed to load team:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTeam()
  }, [])

  // Send invite
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return

    try {
      setIsInviting(true)
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      if (!res.ok) throw new Error('Failed to send invite')
      const data = await res.json() as { invite: TeamInvite }
      setInvites([...invites, data.invite])
      setInviteEmail('')
      setSaveIndicatorVisible(true)
      setTimeout(() => setSaveIndicatorVisible(false), 1500)
    } catch (err) {
      logger.error('Failed to send invite:', err)
    } finally {
      setIsInviting(false)
    }
  }

  // Update member role
  const handleRoleChange = async (memberId: string, newRole: string) => {
    const member = members.find(m => m.id === memberId)
    if (!member) return
    setConfirmDialog({ type: 'role-change', memberId, email: member.email, newRole })
  }

  const confirmRoleChange = async () => {
    if (!confirmDialog || confirmDialog.type !== 'role-change' || !confirmDialog.newRole) return

    try {
      const res = await fetch(`/api/team/${confirmDialog.memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: confirmDialog.newRole }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      setMembers(
        members.map(m =>
          m.id === confirmDialog.memberId ? { ...m, role: confirmDialog.newRole as typeof m.role } : m
        )
      )
      setSaveIndicatorVisible(true)
      setTimeout(() => setSaveIndicatorVisible(false), 1500)
      setConfirmDialog(null)
    } catch (err) {
      logger.error('Failed to update role:', err)
      setConfirmDialog(null)
    }
  }

  // Remove member
  const handleRemoveMember = (memberId: string, email: string) => {
    setConfirmDialog({ type: 'delete', memberId, email })
  }

  const confirmRemoveMember = async () => {
    if (!confirmDialog || confirmDialog.type !== 'delete') return

    try {
      const res = await fetch(`/api/team/${confirmDialog.memberId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove member')
      setMembers(members.filter(m => m.id !== confirmDialog.memberId))
      setSaveIndicatorVisible(true)
      setTimeout(() => setSaveIndicatorVisible(false), 1500)
      setConfirmDialog(null)
    } catch (err) {
      logger.error('Failed to remove member:', err)
      setConfirmDialog(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <IconLoader2 className="size-6 animate-spin" />
          <span className="text-sm">Loading team...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 overflow-auto p-6">
      {/* Save indicator */}
      {saveIndicatorVisible && (
        <div className="fixed right-6 top-20 z-50 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-500 animate-in fade-in slide-in-from-top-2">
          <IconCheck className="size-3.5" />
          Saved
        </div>
      )}

      {/* Invite New Member */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite Team Member</CardTitle>
          <CardDescription>Add new members to your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              className="flex-1"
            />
            <Select value={inviteRole} onValueChange={v => setInviteRole(v as typeof inviteRole)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.filter(r => r.id !== 'owner').map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || isInviting}
            >
              {isInviting ? <IconLoader2 className="size-4 animate-spin" /> : 'Send Invite'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Members ({members.length})</CardTitle>
          <CardDescription>Manage access and roles</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No team members yet
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {members.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {member.display_name || member.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={member.role} />
                    <Select
                      value={member.role}
                      onValueChange={newRole => handleRoleChange(member.id, newRole)}
                      disabled={member.role === 'owner'}
                    >
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(option => (
                          <SelectItem key={option.id} value={option.id}>
                            <div>
                              <div className="font-medium">{option.label}</div>
                              <div className="text-xs text-muted-foreground">{option.desc}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="size-8"
                      onClick={() => handleRemoveMember(member.id, member.email)}
                      disabled={member.role === 'owner'}
                      title={member.role === 'owner' ? 'Cannot remove owner' : 'Remove member'}
                    >
                      <IconTrash className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Invitations ({invites.length})</CardTitle>
            <CardDescription>Waiting for response from invitees</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {invites.map(invite => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {invite.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={invite.role} />
                    <Badge variant="outline" className="capitalize text-amber-500 border-amber-500/30 bg-amber-500/10">
                      {invite.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={open => { if (!open) setConfirmDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === 'delete'
                ? 'Remove Team Member?'
                : `Change Role to ${confirmDialog?.newRole?.charAt(0).toUpperCase()}${confirmDialog?.newRole?.slice(1)}?`
              }
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.type === 'delete'
                ? `${confirmDialog?.email} will lose access to your organization.`
                : `${confirmDialog?.email} will have ${confirmDialog?.newRole} permissions.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmDialog?.type === 'delete' ? 'destructive' : 'default'}
              onClick={confirmDialog?.type === 'delete' ? confirmRemoveMember : confirmRoleChange}
            >
              {confirmDialog?.type === 'delete' ? 'Remove' : 'Change Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
