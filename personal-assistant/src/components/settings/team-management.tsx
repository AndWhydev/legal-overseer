'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Trash2, Copy, Loader2 } from 'lucide-react';
import { logger } from '@/lib/core/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  email: string;
  display_name: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
}

interface TeamInvite {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  expires_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { id: 'owner', label: 'Owner', desc: 'Full access and billing control' },
  { id: 'admin', label: 'Admin', desc: 'Full access except billing' },
  { id: 'member', label: 'Member', desc: 'Can view and edit content' },
  { id: 'viewer', label: 'Viewer', desc: 'Read-only access' },
] as const;

// ─── Inline Styles ───────────────────────────────────────────────────────────

const sectionWrapper: React.CSSProperties = {
  padding: '24px',
  overflow: 'auto',
  height: '100%',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  margin: 0,
};

const sectionDesc: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  margin: '4px 0 16px',
};

const glassCard: React.CSSProperties = {
  padding: '16px',
  borderRadius: 12,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
};

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
};

const ghostBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
};

const accentBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: 'var(--btn-primary-bg, #F1F5F9)',
  border: 'none',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
};

const dangerBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  color: '#EF4444',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
};

// ─── Save Indicator ──────────────────────────────────────────────────────────

function SaveIndicator({ visible, message = 'Saved' }: { visible: boolean; message?: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        right: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 8,
        background: 'rgba(34, 197, 94, 0.12)',
        color: '#22C55E',
        fontSize: 14,
        fontWeight: 500,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 300ms, transform 300ms',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <Check size={14} />
      {message}
    </div>
  );
}

// ─── Role Badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    owner: { bg: 'rgba(255, 255, 255, 0.08)', text: '#F1F5F9' },
    admin: { bg: 'rgba(168, 85, 247, 0.15)', text: '#A855F7' },
    member: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
    viewer: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6B7280' },
  };

  const color = colors[role] || colors.member;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 8,
        background: color.bg,
        color: color.text,
        fontSize: 14,
        fontWeight: 500,
        textTransform: 'capitalize',
      }}
    >
      {role}
    </span>
  );
}

// ─── Role Dropdown ───────────────────────────────────────────────────────────

function RoleDropdown({
  currentRole,
  onRoleChange,
  disabled = false,
}: {
  currentRole: string;
  onRoleChange: (role: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          ...ghostBtn,
          opacity: disabled ? 0.5 : 1,
        }}
        onMouseEnter={e => {
          if (!disabled) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
          }
        }}
        onMouseLeave={e => {
          if (!disabled) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }
        }}
      >
        <div style={{ textTransform: 'capitalize' }}>{currentRole}</div>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            width: 200,
            background: 'var(--glass-bg-heavy, rgba(12, 16, 24, 0.85))',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            borderRadius: 12,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 1000,
            boxShadow: '0 12px 24px rgba(0, 0, 0, 0.3)',
          }}
        >
          {ROLE_OPTIONS.map(option => (
            <button
              key={option.id}
              onClick={() => {
                onRoleChange(option.id);
                setIsOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                background: currentRole === option.id ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                color: currentRole === option.id ? 'var(--text-primary, #F1F5F9)' : 'var(--text-primary, #F1F5F9)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => {
                if (currentRole !== option.id) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                }
              }}
              onMouseLeave={e => {
                if (currentRole !== option.id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 2 }}>{option.label}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>
                {option.desc}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Confirmation Dialog ──────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDanger = false,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDanger?: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />
      <div
        style={{
          ...glassCard,
          position: 'relative',
          maxWidth: 380,
          width: '90%',
          padding: '24px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
          {title}
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '8px 0 16px' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              ...ghostBtn,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              ...(isDanger ? dangerBtn : accentBtn),
            }}
            onMouseEnter={e => {
              if (isDanger) {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              } else {
                e.currentTarget.style.background = '#E2E8F0';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => {
              if (isDanger) {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              } else {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Team Management Component ────────────────────────────────────────────────

export function TeamManagementTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin' | 'viewer'>('member');
  const [isInviting, setIsInviting] = useState(false);

  const [saveIndicatorVisible, setSaveIndicatorVisible] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete' | 'role-change';
    memberId: string;
    email: string;
    newRole?: string;
  } | null>(null);

  // Load team data
  useEffect(() => {
    const fetchTeam = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/team');
        if (!res.ok) throw new Error('Failed to fetch team');
        const data = await res.json() as { members: TeamMember[]; invites: TeamInvite[] };
        setMembers(data.members);
        setInvites(data.invites);
      } catch (err) {
        logger.error('Failed to load team:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeam();
  }, []);

  // Send invite
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    try {
      setIsInviting(true);
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) throw new Error('Failed to send invite');
      const data = await res.json() as { invite: TeamInvite };
      setInvites([...invites, data.invite]);
      setInviteEmail('');
      setSaveIndicatorVisible(true);
      setTimeout(() => setSaveIndicatorVisible(false), 1500);
    } catch (err) {
      logger.error('Failed to send invite:', err);
    } finally {
      setIsInviting(false);
    }
  };

  // Update member role
  const handleRoleChange = async (memberId: string, newRole: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    setConfirmDialog({ type: 'role-change', memberId, email: member.email, newRole });
  };

  const confirmRoleChange = async () => {
    if (!confirmDialog || confirmDialog.type !== 'role-change' || !confirmDialog.newRole) return;

    try {
      const res = await fetch(`/api/team/${confirmDialog.memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: confirmDialog.newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      setMembers(
        members.map(m =>
          m.id === confirmDialog.memberId ? { ...m, role: confirmDialog.newRole as typeof m.role } : m
        )
      );
      setSaveIndicatorVisible(true);
      setTimeout(() => setSaveIndicatorVisible(false), 1500);
      setConfirmDialog(null);
    } catch (err) {
      logger.error('Failed to update role:', err);
      setConfirmDialog(null);
    }
  };

  // Remove member
  const handleRemoveMember = (memberId: string, email: string) => {
    setConfirmDialog({ type: 'delete', memberId, email });
  };

  const confirmRemoveMember = async () => {
    if (!confirmDialog || confirmDialog.type !== 'delete') return;

    try {
      const res = await fetch(`/api/team/${confirmDialog.memberId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove member');
      setMembers(members.filter(m => m.id !== confirmDialog.memberId));
      setSaveIndicatorVisible(true);
      setTimeout(() => setSaveIndicatorVisible(false), 1500);
      setConfirmDialog(null);
    } catch (err) {
      logger.error('Failed to remove member:', err);
      setConfirmDialog(null);
    }
  };

  if (isLoading) {
    return (
      <div style={sectionWrapper}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary, #94A3B8)' }}>
            <Loader2 size={24} style={{ animation: 'bb-spin 1s linear infinite', marginBottom: 12 }} />
            <div style={{ fontSize: 14 }}>Loading team...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={sectionWrapper}>
      <SaveIndicator visible={saveIndicatorVisible} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Invite New Member */}
        <div>
          <h3 style={sectionTitle}>Invite Team Member</h3>
          <p style={sectionDesc}>Add new members to your organization</p>
          <div style={{ ...glassCard, display: 'flex', gap: 8 }}>
            <input
              type="email"
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleInvite()}
              style={{
                flex: 1,
                padding: '12px 12px',
                borderRadius: 8,
                background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-primary, #F1F5F9)',
                fontSize: 14,
                transition: 'border-color 200ms',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            />

            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
              style={{
                padding: '12px 12px',
                borderRadius: 8,
                background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-primary, #F1F5F9)',
                fontSize: 14,
                cursor: 'pointer',
                transition: 'border-color 200ms',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              {ROLE_OPTIONS.filter(r => r.id !== 'owner').map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || isInviting}
              style={{
                ...accentBtn,
                opacity: !inviteEmail.trim() || isInviting ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                if (inviteEmail.trim() && !isInviting) {
                  e.currentTarget.style.background = '#E2E8F0';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#F1F5F9';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {isInviting ? <Loader2 size={14} style={{ animation: 'bb-spin 1s linear infinite' }} /> : 'Send Invite'}
            </button>
          </div>
        </div>

        {/* Team Members */}
        <div>
          <h3 style={sectionTitle}>Team Members ({members.length})</h3>
          <p style={sectionDesc}>Manage access and roles</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.length === 0 ? (
              <div style={{ ...glassCard, textAlign: 'center', padding: '24px' }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: 0 }}>
                  No team members yet
                </p>
              </div>
            ) : (
              members.map(member => (
                <div key={member.id} style={{ ...listRow, justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                      {member.display_name || member.email}
                    </p>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '2px 0 0' }}>
                      {member.email}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RoleBadge role={member.role} />
                    <RoleDropdown
                      currentRole={member.role}
                      onRoleChange={newRole => handleRoleChange(member.id, newRole)}
                      disabled={member.role === 'owner'}
                    />
                    <button
                      onClick={() => handleRemoveMember(member.id, member.email)}
                      disabled={member.role === 'owner'}
                      style={{
                        ...dangerBtn,
                        opacity: member.role === 'owner' ? 0.3 : 1,
                      }}
                      onMouseEnter={e => {
                        if (member.role !== 'owner') {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (member.role !== 'owner') {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        }
                      }}
                      title={member.role === 'owner' ? 'Cannot remove owner' : 'Remove member'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <div>
            <h3 style={sectionTitle}>Pending Invitations ({invites.length})</h3>
            <p style={sectionDesc}>Waiting for response from invitees</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invites.map(invite => (
                <div key={invite.id} style={{ ...listRow, justifyContent: 'space-between', opacity: 0.7 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
                      {invite.email}
                    </p>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '2px 0 0' }}>
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RoleBadge role={invite.role} />
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: 8,
                        background: 'rgba(251, 191, 36, 0.15)',
                        color: '#FBBF24',
                        fontSize: 14,
                        fontWeight: 500,
                        textTransform: 'capitalize',
                      }}
                    >
                      {invite.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {confirmDialog && (
        <ConfirmDialog
          title={
            confirmDialog.type === 'delete'
              ? 'Remove Team Member?'
              : `Change Role to ${confirmDialog.newRole?.charAt(0).toUpperCase()}${confirmDialog.newRole?.slice(1)}?`
          }
          message={
            confirmDialog.type === 'delete'
              ? `${confirmDialog.email} will lose access to your organization.`
              : `${confirmDialog.email} will have ${confirmDialog.newRole} permissions.`
          }
          confirmLabel={confirmDialog.type === 'delete' ? 'Remove' : 'Change Role'}
          cancelLabel="Cancel"
          isDanger={confirmDialog.type === 'delete'}
          onConfirm={confirmDialog.type === 'delete' ? confirmRemoveMember : confirmRoleChange}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
