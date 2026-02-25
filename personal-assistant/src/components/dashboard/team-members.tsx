'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Mail, Trash2, Loader2, UserPlus, Shield } from 'lucide-react';

interface Member {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

const ROLE_OPTIONS = ['admin', 'member', 'viewer'] as const;

const roleBadgeColor: Record<string, string> = {
  owner: 'bg-purple-500/20 text-purple-300',
  admin: 'bg-[var(--bb-orange,#FF5A1F)]/20 text-[var(--bb-orange,#FF5A1F)]',
  member: 'bg-blue-500/20 text-blue-300',
  viewer: 'bg-muted text-muted-foreground',
};

export function TeamMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('member');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch('/api/org/members'),
        fetch('/api/org/invite'),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members ?? []);
      }
      if (invitesRes.ok) {
        const data = await invitesRes.json();
        setInvites(data.invitations ?? []);
      }
    } catch {
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/org/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInviteEmail('');
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      const res = await fetch('/api/org/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      await fetchData();
    } catch {
      setError('Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      const res = await fetch('/api/org/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      await fetchData();
    } catch {
      setError('Failed to remove member');
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    try {
      const res = await fetch('/api/org/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: invitationId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      await fetchData();
    } catch {
      setError('Failed to revoke invitation');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Invite Form */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus size={16} />
            Invite Team Member
          </CardTitle>
          <CardDescription>Send an invitation to join your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={sending || !inviteEmail}
              className="flex items-center gap-1.5 rounded-md bg-[var(--bb-orange,#FF5A1F)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Invite
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={16} />
            Team Members
            <Badge variant="outline" className="ml-auto text-xs">{members.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No team members yet.</p>
          ) : (
            members.map(member => (
              <div key={member.id} className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                    {(member.display_name ?? member.email)?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {member.display_name ?? member.email}
                    </p>
                    {member.display_name && (
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.role === 'owner' ? (
                    <Badge className={`text-xs ${roleBadgeColor.owner}`}>
                      <Shield size={10} className="mr-1" /> Owner
                    </Badge>
                  ) : (
                    <select
                      value={member.role}
                      onChange={e => handleRoleChange(member.id, e.target.value)}
                      className={`rounded-md border-0 bg-transparent px-2 py-1 text-xs ${roleBadgeColor[member.role] ?? ''}`}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  )}
                  {member.role !== 'owner' && (
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      title="Remove member"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invites.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail size={16} />
              Pending Invitations
              <Badge variant="outline" className="ml-auto text-xs">{invites.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {invites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invite.role} &middot; Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeInvite(invite.id)}
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                >
                  Revoke
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TeamMembers;
