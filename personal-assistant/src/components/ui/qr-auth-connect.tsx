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

      <div className="flex flex-col items-center gap-5 px-6 py-8 justify-center" style={{ minHeight: 320 }}>

        {/* ─── WhatsApp icon (always visible in loading / post-QR states) ─── */}
        {(isPreQr || isPostQr) && (
          <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
            <img
              src="/icons/integrations/whatsapp.png"
              alt="WhatsApp"
              width={48}
              height={48}
              className="rounded-xl transition-opacity duration-400"
              style={{ opacity: phase === 'connected' ? 1 : 0.9 }}
            />
            {/* Spinner ring around icon for loading states */}
            {(isPreQr || phase === 'scanned' || phase === 'syncing') && (
              <div
                className="absolute -inset-1 rounded-full border-2 border-transparent border-t-[var(--text-secondary)]"
                style={{ animation: 'qr-spin 1s linear infinite' }}
              />
            )}
            {/* Success ring pulse for connected */}
            {phase === 'connected' && (
              <div
                className="absolute -inset-1 rounded-full border-2 border-[var(--status-success-fg)]"
                style={{ animation: 'qr-pulse-ring 1s ease-out forwards' }}
              />
            )}
          </div>
        )}

        {/* ─── QR Code ─── */}
        {(phase === 'qr_ready' || phase === 'qr_waiting') && (
          <div className="flex flex-col items-center gap-4">
            {qrData ? (
              <div className="rounded-2xl bg-white p-3 shadow-lg transition-all duration-400">
                <canvas ref={canvasRef} width={220} height={220} className="block" />
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-2xl bg-secondary" style={{ width: 244, height: 244 }}>
                <Loader2
                  size={24}
                  className="text-[var(--text-secondary)]"
                  style={{ animation: 'qr-spin 1s linear infinite' }}
                />
              </div>
            )}
          </div>
        )}

        {/* ─── Scanned / Connecting transition ─── */}
        {phase === 'scanned' && (
          <div
            className="flex items-center justify-center rounded-2xl bg-secondary"
            style={{ width: 244, height: 244, animation: 'qr-success-in 500ms ease-out' }}
          >
            <div className="flex flex-col items-center gap-2">
              <Loader2
                size={28}
                className="text-[var(--text-secondary)]"
                style={{ animation: 'qr-spin 1s linear infinite' }}
              />
            </div>
          </div>
        )}

        {/* ─── Connected success state ─── */}
        {phase === 'connected' && (
          <div
            className="flex flex-col items-center gap-1"
            style={{ animation: 'qr-success-in 500ms ease-out' }}
          >
            {/* SF Symbol-style checkmark circle */}
            <div className="flex items-center justify-center rounded-full bg-[var(--status-success-bg)] mb-1" style={{ width: 40, height: 40 }}>
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
              <span className="text-sm font-normal text-[var(--text-secondary)] tracking-wide">
                {phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`}
              </span>
            )}
          </div>
        )}

        {/* ─── Error state ─── */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <img
              src="/icons/integrations/whatsapp.png"
              alt="WhatsApp"
              width={48}
              height={48}
              className="rounded-xl opacity-40"
              style={{ filter: 'grayscale(0.6)' }}
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {errorMsg || 'Something went wrong'}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
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
              className="flex items-center gap-2 px-5 py-2 rounded-full border border-border bg-secondary text-[var(--text-primary)] text-sm font-medium cursor-pointer transition-colors duration-200 hover:bg-secondary hover:border-border"
            >
              <RotateCcw size={14} />
              Try Again
            </button>
          </div>
        )}

        {/* ─── Single status line ─── */}
        <span
          className="text-sm text-center leading-relaxed transition-colors duration-300"
          style={{
            maxWidth: 280,
            fontWeight: phase === 'connected' ? 500 : 400,
            color: phase === 'connected'
              ? 'var(--status-success-fg)'
              : phase === 'error'
                ? 'transparent' // hidden — error has its own copy above
                : 'var(--text-secondary)',
          }}
        >
          {STATUS_COPY[phase]}
        </span>
      </div>
    </>
  );
}

export default QrAuthConnect;
