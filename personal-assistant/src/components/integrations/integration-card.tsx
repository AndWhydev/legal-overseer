'use client';

import React, { useState, useEffect, useRef } from 'react';
import { IconLoader2, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BRAND_ICONS } from './integration-icons';
import type { Integration } from '@/lib/integrations/types';

// ---- Apple Pay-style success tick ----

function SuccessTick({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
    >
      <style>{`
        @keyframes bb-tick-circle {
          from { stroke-dashoffset: 62.83; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes bb-tick-check {
          from { stroke-dashoffset: 16; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes bb-tick-fade {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; }
        }
        .bb-tick-group {
          animation: bb-tick-fade 2s ease forwards;
        }
        .bb-tick-circle {
          stroke-dasharray: 62.83;
          stroke-dashoffset: 62.83;
          animation: bb-tick-circle 400ms cubic-bezier(0.65, 0, 0.35, 1) 100ms forwards;
        }
        .bb-tick-check {
          stroke-dasharray: 16;
          stroke-dashoffset: 16;
          animation: bb-tick-check 300ms cubic-bezier(0.65, 0, 0.35, 1) 400ms forwards;
        }
      `}</style>
      <g className="bb-tick-group">
        <circle className="bb-tick-circle" cx="12" cy="12" r="10" stroke="#22C55E" strokeWidth="2" />
        <path className="bb-tick-check" d="M8 12.5l2.5 2.5 5.5-5.5" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

interface IntegrationCardProps {
  integration: Integration;
  isConnected?: boolean;
  onStatusChange?: () => void;
  onWhatsAppConnect?: () => void;
  style?: React.CSSProperties;
}

export function IntegrationCard({ integration, isConnected = false, onStatusChange, onWhatsAppConnect, style: externalStyle }: IntegrationCardProps) {
  const BrandIcon = BRAND_ICONS[integration.id];
  const isComingSoon = integration.status === 'coming_soon';
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectingFeedback, setConnectingFeedback] = useState(false);
  const [showTick, setShowTick] = useState(false);
  const prevConnectedRef = useRef(isConnected);

  const connected = isConnected || integration.status === 'connected';

  // Detect transition from disconnected -> connected and show success tick
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      setShowTick(true);
      const timer = setTimeout(() => setShowTick(false), 2000);
      return () => clearTimeout(timer);
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected]);

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
        className={cn(
          'flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors',
          !isComingSoon && 'hover:bg-card',
          isComingSoon && 'opacity-50',
        )}
        style={externalStyle}
      >
        {/* App Icon */}
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          {BrandIcon
            ? <BrandIcon size={36} />
            : <div className="size-9 rounded-lg" style={{ background: `${integration.color}20` }} />
          }
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{integration.name}</span>
            <SuccessTick visible={showTick} />
            {isComingSoon && (
              <Badge variant="secondary">Soon</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {integration.description}
          </p>
        </div>

        {/* Action button */}
        {!isComingSoon && (
          connected ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
              disabled={isLoading}
            >
              {isLoading
                ? <IconLoader2 size={14} className="animate-spin" />
                : 'Disconnect'
              }
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleConnect(); }}
              disabled={isLoading || connectingFeedback}
            >
              {connectingFeedback
                ? <><IconLoader2 size={14} className="animate-spin" /> Connecting</>
                : 'Connect'
              }
            </Button>
          )
        )}
      </div>

      {/* API Key Dialog */}
      {apiKeyDialogOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => { setApiKeyDialogOpen(false); setError(''); }}
          />
          <div className="relative w-[90%] max-w-[420px] rounded-xl border border-border bg-card p-6 shadow-lg">
            <button
              onClick={() => { setApiKeyDialogOpen(false); setError(''); }}
              className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-foreground"
            >
              <IconX size={16} />
            </button>

            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center overflow-hidden rounded-lg">
                {BrandIcon && <BrandIcon size={36} />}
              </div>
              <div>
                <h3 className="text-base font-medium">
                  Connect {integration.name}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Enter your API key to connect.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Input
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={isLoading}
              onKeyDown={e => { if (e.key === 'Enter' && apiKey.trim()) handleApiKeySubmit(); }}
              className="mb-4"
            />

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => { setApiKeyDialogOpen(false); setError(''); }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApiKeySubmit}
                disabled={isLoading || !apiKey.trim()}
              >
                {isLoading ? <><IconLoader2 size={14} className="animate-spin" /> Connecting</> : 'Connect'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
