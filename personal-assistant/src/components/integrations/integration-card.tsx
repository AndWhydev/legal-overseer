'use client';

import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { BRAND_ICONS } from './integration-icons';
import type { Integration } from '@/lib/integrations/types';

interface IntegrationCardProps {
  integration: Integration;
  isConnected?: boolean;
  onStatusChange?: () => void;
  onWhatsAppConnect?: () => void;
  style?: React.CSSProperties;
}

// Shared glass button base
const glassBtn: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 10,
  background: 'rgba(255, 255, 255, 0.06)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 180ms ease',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  lineHeight: 1.4,
};

export function IntegrationCard({ integration, isConnected = false, onStatusChange, onWhatsAppConnect, style: externalStyle }: IntegrationCardProps) {
  const BrandIcon = BRAND_ICONS[integration.id];
  const isComingSoon = integration.status === 'coming_soon';
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [connectingFeedback, setConnectingFeedback] = useState(false);

  const connected = isConnected || integration.status === 'connected';

  const handleConnect = () => {
    if (integration.id === 'whatsapp') {
      onWhatsAppConnect?.();
      return;
    }
    if (integration.authMethod === 'oauth') {
      setConnectingFeedback(true);
      setTimeout(() => {
        window.location.href = `/api/auth/oauth/start?provider=${encodeURIComponent(integration.id)}`;
      }, 400);
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
          gap: 12,
          padding: '12px 14px',
          borderRadius: 14,
          background: hovered && !isComingSoon
            ? 'rgba(255, 255, 255, 0.04)'
            : 'var(--glass-pill-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-card-border)',
          boxShadow: 'var(--glass-card-inset)',
          transition: 'all 300ms cubic-bezier(0.2, 0.9, 0.3, 1)',
          opacity: isComingSoon ? 0.5 : 1,
          ...externalStyle,
        }}
      >
        {/* App Icon */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {BrandIcon
            ? <BrandIcon size={36} />
            : <div style={{ width: 36, height: 36, borderRadius: 8, background: `${integration.color}20` }} />
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {integration.name}
            </span>
            {isComingSoon && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 6px',
                borderRadius: 5,
                fontSize: 9,
                fontWeight: 500,
                background: 'var(--glass-hover-bg)',
                color: 'var(--text-dim)',
              }}>
                Soon
              </span>
            )}
          </div>
          <p style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            margin: '1px 0 0',
            lineHeight: 1.35,
          }}>
            {integration.description}
          </p>
        </div>

        {/* Action button — glass style for all states */}
        {!isComingSoon && (
          connected ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
              disabled={isLoading}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
              style={{
                ...glassBtn,
                color: 'var(--text-secondary)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading
                ? <Loader2 size={11} style={{ animation: 'bb-spin 1s linear infinite' }} />
                : 'Disconnect'
              }
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleConnect(); }}
              disabled={isLoading || connectingFeedback}
              onMouseEnter={e => {
                if (!connectingFeedback) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                }
              }}
              onMouseLeave={e => {
                if (!connectingFeedback) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                }
              }}
              style={{
                ...glassBtn,
                color: connectingFeedback ? 'var(--text-secondary)' : 'var(--text-primary)',
                cursor: (isLoading || connectingFeedback) ? 'not-allowed' : 'pointer',
                opacity: (isLoading || connectingFeedback) ? 0.7 : 1,
              }}
            >
              {connectingFeedback
                ? <><Loader2 size={11} style={{ animation: 'bb-spin 1s linear infinite' }} /> Connecting</>
                : 'Connect'
              }
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
                width: 36, height: 36, borderRadius: 8, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {BrandIcon && <BrandIcon size={36} />}
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
                  ...glassBtn,
                  padding: '8px 16px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApiKeySubmit}
                disabled={isLoading || !apiKey.trim()}
                style={{
                  ...glassBtn,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: 'var(--text-primary)',
                  cursor: isLoading || !apiKey.trim() ? 'not-allowed' : 'pointer',
                  opacity: isLoading || !apiKey.trim() ? 0.5 : 1,
                }}
              >
                {isLoading ? <><Loader2 size={12} style={{ animation: 'bb-spin 1s linear infinite' }} /> Connecting</> : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
