'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, RotateCcw } from 'lucide-react';

interface QrAuthConnectProps {
  sessionId: string;
  serviceName: string;
  onConnected?: (phoneNumber: string) => void;
  onError?: (error: string) => void;
}

type PairingPhase =
  | 'loading'
  | 'qr_waiting'
  | 'qr_ready'
  | 'scanned'
  | 'syncing'
  | 'connected'
  | 'error';

const STATUS_COPY: Record<PairingPhase, string> = {
  loading: 'Preparing...',
  qr_waiting: 'Preparing...',
  qr_ready: 'Open WhatsApp, go to Linked Devices, and scan this code.',
  scanned: 'Connecting...',
  syncing: 'Almost there...',
  connected: 'Connected',
  error: 'Something went wrong',
};

/* ─── Keyframe styles injected once ─── */
const KEYFRAMES = `
@keyframes qr-fade-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.92); }
}
@keyframes qr-success-in {
  0%   { opacity: 0; transform: scale(0.8); }
  60%  { transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes qr-checkmark-draw {
  from { stroke-dashoffset: 20; }
  to   { stroke-dashoffset: 0; }
}
@keyframes qr-pulse-ring {
  0%   { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(1.8); opacity: 0; }
}
@keyframes qr-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

/**
 * QR code pairing component — Apple-minimal design.
 * Subscribes to a session row via Supabase realtime, renders QR when available,
 * and shows smooth transitions through the pairing flow.
 */
export function QrAuthConnect({ sessionId, serviceName, onConnected, onError }: QrAuthConnectProps) {
  const [phase, setPhase] = useState<PairingPhase>('loading');
  const [qrData, setQrData] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevStatusRef = useRef<string | null>(null);

  const handleRowUpdate = useCallback((dbStatus: string, qr: string | null, phone: string | null) => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = dbStatus;

    setQrData(qr);
    setPhoneNumber(phone);

    if (dbStatus === 'pairing' && qr) {
      if (prev !== 'pairing' || phase === 'loading' || phase === 'qr_waiting') {
        setPhase('qr_ready');
      }
    } else if (dbStatus === 'pairing' && !qr && prev === 'pairing') {
      setPhase('scanned');
    } else if (dbStatus === 'pairing' && !qr) {
      setPhase('qr_waiting');
    } else if (dbStatus === 'connected') {
      if (phase !== 'connected') {
        setPhase('syncing');
        setTimeout(() => {
          setPhase('connected');
          if (phone) onConnected?.(phone);
        }, 1200);
      }
    } else if (dbStatus === 'disconnected' && prev === 'pairing') {
      // Transient reconnect — don't surface
    } else if (dbStatus === 'error') {
      setPhase('error');
      setErrorMsg('Connection failed. Please try again.');
      onError?.('Connection failed. Please try again.');
    }
  }, [phase, onConnected, onError]);

  /* ─── Supabase realtime subscription ─── */
  useEffect(() => {
    const client = createClient();
    if (!client) return;

    client
      .from('whatsapp_sessions')
      .select('status, qr_data, phone_number')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        if (data) {
          handleRowUpdate(data.status, data.qr_data, data.phone_number);
        }
      });

    const channel = client
      .channel(`whatsapp-session-${sessionId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload: any) => {
          const row = payload.new;
          handleRowUpdate(row.status, row.qr_data, row.phone_number);
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /* ─── QR code canvas rendering ─── */
  useEffect(() => {
    if (!qrData || !canvasRef.current) return;

    import('qrcode').then((QRCode) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      QRCode.toCanvas(canvas, qrData, {
        width: 220,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = 220;
          canvas.height = 220;
          ctx.drawImage(img, 0, 0, 220, 220);
        };
        img.src = qrData;
      });
    });
  }, [qrData]);

  const isPreQr = phase === 'loading' || phase === 'qr_waiting';
  const isPostQr = phase === 'scanned' || phase === 'syncing' || phase === 'connected';

  return (
    <>
      {/* Inject keyframes */}
      <style>{KEYFRAMES}</style>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        padding: '32px 24px',
        minHeight: 320,
        justifyContent: 'center',
      }}>

        {/* ─── WhatsApp icon (always visible in loading / post-QR states) ─── */}
        {(isPreQr || isPostQr) && (
          <div style={{
            position: 'relative',
            width: 56,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img
              src="/icons/integrations/whatsapp.png"
              alt="WhatsApp"
              width={48}
              height={48}
              style={{
                borderRadius: 12,
                opacity: phase === 'connected' ? 1 : 0.9,
                transition: 'opacity 400ms ease',
              }}
            />
            {/* Spinner ring around icon for loading states */}
            {(isPreQr || phase === 'scanned' || phase === 'syncing') && (
              <div style={{
                position: 'absolute',
                inset: -4,
                borderRadius: '50%',
                border: '2px solid transparent',
                borderTopColor: 'var(--text-secondary)',
                animation: 'qr-spin 1s linear infinite',
              }} />
            )}
            {/* Success ring pulse for connected */}
            {phase === 'connected' && (
              <div style={{
                position: 'absolute',
                inset: -4,
                borderRadius: '50%',
                border: '2px solid var(--status-success-fg)',
                animation: 'qr-pulse-ring 1s ease-out forwards',
              }} />
            )}
          </div>
        )}

        {/* ─── QR Code ─── */}
        {(phase === 'qr_ready' || phase === 'qr_waiting') && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            animation: qrData ? undefined : undefined,
          }}>
            {qrData ? (
              <div style={{
                borderRadius: 16,
                background: '#ffffff',
                padding: 12,
                boxShadow: '0 2px 16px rgba(0, 0, 0, 0.15)',
                transition: 'opacity 400ms ease, transform 400ms ease',
              }}>
                <canvas ref={canvasRef} width={220} height={220} style={{ display: 'block' }} />
              </div>
            ) : (
              <div style={{
                width: 244,
                height: 244,
                borderRadius: 16,
                background: 'var(--secondary)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Loader2
                  size={24}
                  style={{
                    color: 'var(--text-secondary)',
                    animation: 'qr-spin 1s linear infinite',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ─── Scanned / Connecting transition ─── */}
        {phase === 'scanned' && (
          <div style={{
            width: 244,
            height: 244,
            borderRadius: 16,
            background: 'var(--secondary)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'qr-success-in 500ms ease-out',
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}>
              <Loader2
                size={28}
                style={{
                  color: 'var(--text-secondary)',
                  animation: 'qr-spin 1s linear infinite',
                }}
              />
            </div>
          </div>
        )}

        {/* ─── Connected success state ─── */}
        {phase === 'connected' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            animation: 'qr-success-in 500ms ease-out',
          }}>
            {/* SF Symbol-style checkmark circle */}
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--status-success-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M5 10.5L8.5 14L15 7"
                  stroke="var(--status-success-fg)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 20,
                    strokeDashoffset: 0,
                    animation: 'qr-checkmark-draw 400ms ease-out',
                  }}
                />
              </svg>
            </div>
            {phoneNumber && (
              <span style={{
                fontSize: 14,
                fontWeight: 400,
                color: 'var(--text-secondary)',
                letterSpacing: '0.02em',
              }}>
                {phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`}
              </span>
            )}
          </div>
        )}

        {/* ─── Error state ─── */}
        {phase === 'error' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}>
            <img
              src="/icons/integrations/whatsapp.png"
              alt="WhatsApp"
              width={48}
              height={48}
              style={{
                borderRadius: 12,
                opacity: 0.4,
                filter: 'grayscale(0.6)',
              }}
            />
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}>
                {errorMsg || 'Something went wrong'}
              </span>
              <span style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
              }}>
                Check your connection and try again.
              </span>
            </div>
            <button
              onClick={() => {
                setPhase('loading');
                setErrorMsg(null);
                prevStatusRef.current = null;
                // Re-fetch triggers via sessionId effect
                const client = createClient();
                if (!client) return;
                client
                  .from('whatsapp_sessions')
                  .select('status, qr_data, phone_number')
                  .eq('id', sessionId)
                  .single()
                  .then(({ data }) => {
                    if (data) {
                      handleRowUpdate(data.status, data.qr_data, data.phone_number);
                    }
                  });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 20px',
                borderRadius: 20,
                border: '1px solid var(--border)',
                background: 'var(--secondary)',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 200ms ease, border-color 200ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--glass-hover-bg)';
                e.currentTarget.style.borderColor = 'var(--border-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <RotateCcw size={14} />
              Try Again
            </button>
          </div>
        )}

        {/* ─── Single status line ─── */}
        <span style={{
          fontSize: 14,
          fontWeight: phase === 'connected' ? 500 : 400,
          color: phase === 'connected'
            ? 'var(--status-success-fg)'
            : phase === 'error'
              ? 'transparent' // hidden — error has its own copy above
              : 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: 280,
          lineHeight: 1.45,
          transition: 'color 300ms ease',
        }}>
          {STATUS_COPY[phase]}
        </span>
      </div>
    </>
  );
}

export default QrAuthConnect;
