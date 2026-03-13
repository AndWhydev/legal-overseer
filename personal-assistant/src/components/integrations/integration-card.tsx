'use client';

import React, { useState } from 'react';
import {
  Mail, Calendar, CheckSquare, Hash, FileText, Users,
  BarChart3, CreditCard, MessageSquare, Phone, MessageCircle,
  CalendarClock, Send, Loader2, X,
  type LucideIcon,
} from 'lucide-react';
import type { Integration } from '@/lib/integrations/types';

const ICON_MAP: Record<string, LucideIcon> = {
  Mail, Calendar, CheckSquare, Hash, FileText, Users,
  BarChart3, CreditCard, MessageSquare, Phone, MessageCircle,
  CalendarClock, Send,
};

interface IntegrationCardProps {
  integration: Integration;
  isConnected?: boolean;
  onStatusChange?: () => void;
  onWhatsAppConnect?: () => void;
}

export function IntegrationCard({ integration, isConnected = false, onStatusChange, onWhatsAppConnect }: IntegrationCardProps) {
  const Icon = ICON_MAP[integration.icon];
  const isComingSoon = integration.status === 'coming_soon';
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const connected = isConnected || integration.status === 'connected';

  const handleConnect = () => {
    if (integration.id === 'whatsapp') {
      onWhatsAppConnect?.();
      return;
    }
    if (integration.authMethod === 'oauth') {
      window.location.href = `/api/auth/oauth/start?provider=${encodeURIComponent(integration.id)}`;
    } else if (integration.authMethod === 'api_key') {
      setApiKeyDialogOpen(true);
    }
  };

  const handleApiKeySubmit = async () => {
    if (!apiKey.trim()) { setError('API key is required'); return; }
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: integration.id, credentials: { api_key: apiKey } }),
      });
      if (!response.ok) {
        const data = await response.json() as { error: string };
        throw new Error(data.error || 'Failed to connect');
      }
      setApiKeyDialogOpen(false);
      setApiKey('');
      onStatusChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/settings/integrations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: integration.id }),
      });
      if (!response.ok) {
        const data = await response.json() as { error: string };
        throw new Error(data.error || 'Failed to disconnect');
      }
      onStatusChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnection failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 16,
          background: hovered && !isComingSoon
            ? 'rgba(255, 255, 255, 0.04)'
            : 'var(--glass-pill-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: connected
            ? '1px solid rgba(34, 197, 94, 0.2)'
            : '1px solid var(--glass-card-border)',
          boxShadow: 'var(--glass-card-inset)',
          transition: 'all 200ms ease',
          opacity: isComingSoon ? 0.5 : 1,
        }}
      >
        {/* Icon */}
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${integration.color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {Icon && <Icon size={20} style={{ color: integration.color }} />}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              {integration.name}
            </span>
            {connected && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.02em',
                background: 'rgba(34, 197, 94, 0.12)',
                color: '#22C55E',
              }}>
                Connected
              </span>
            )}
            {isComingSoon && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 500,
                background: 'var(--glass-hover-bg)',
                color: 'var(--text-dim)',
              }}>
                Coming Soon
              </span>
            )}
          </div>
          <p style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            margin: '2px 0 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {integration.description}
          </p>
        </div>

        {/* Action button */}
        {!isComingSoon && (
          connected ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
              disabled={isLoading}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: 'transparent',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                fontSize: 12,
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                transition: 'all 150ms',
                flexShrink: 0,
              }}
            >
              {isLoading ? <Loader2 size={12} style={{ animation: 'bb-spin 1s linear infinite' }} /> : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleConnect(); }}
              disabled={isLoading}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--glass-interactive-border)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                transition: 'all 150ms',
                flexShrink: 0,
              }}
            >
              Connect
            </button>
          )
        )}
      </div>

      {/* API Key Dialog (glassmorphic modal) */}
      {apiKeyDialogOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => { setApiKeyDialogOpen(false); setError(''); }}
          />
          <div style={{
            position: 'relative',
            padding: 24,
            borderRadius: 16,
            background: 'var(--glass-card-bg)',
            backdropFilter: 'var(--glass-card-blur)',
            WebkitBackdropFilter: 'var(--glass-card-blur)',
            border: '1px solid var(--glass-card-border)',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
            maxWidth: 420,
            width: '90%',
          }}>
            <button
              onClick={() => { setApiKeyDialogOpen(false); setError(''); }}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${integration.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {Icon && <Icon size={18} style={{ color: integration.color }} />}
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Connect {integration.name}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                  Enter your API key to connect.
                </p>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444',
                fontSize: 13, marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <input
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={isLoading}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter' && apiKey.trim()) handleApiKeySubmit(); }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(13, 17, 23, 0.6)',
                border: inputFocused
                  ? '1px solid rgba(255, 255, 255, 0.2)'
                  : '1px solid var(--glass-interactive-border)',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 200ms',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setApiKeyDialogOpen(false); setError(''); }}
                disabled={isLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid var(--glass-interactive-border)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApiKeySubmit}
                disabled={isLoading || !apiKey.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  background: '#1A1A1B',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isLoading || !apiKey.trim() ? 'not-allowed' : 'pointer',
                  opacity: isLoading || !apiKey.trim() ? 0.5 : 1,
                  transition: 'all 150ms',
                }}
              >
                {isLoading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
