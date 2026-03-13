'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle, XCircle, Smartphone, Wifi, ShieldCheck, Link } from 'lucide-react';

interface QrAuthConnectProps {
  sessionId: string;
  serviceName: string;
  onConnected?: (phoneNumber: string) => void;
  onError?: (error: string) => void;
}

type PairingPhase =
  | 'loading'        // Waiting for session
  | 'qr_waiting'     // Bridge started, waiting for QR
  | 'qr_ready'       // QR visible, waiting for scan
  | 'scanned'        // QR scanned, handshake in progress
  | 'syncing'        // Connected, syncing history
  | 'connected'      // Fully connected
  | 'error';

const PHASE_LABELS: Record<PairingPhase, string> = {
  loading: 'Starting bridge...',
  qr_waiting: 'Generating QR code...',
  qr_ready: 'Scan the QR code with your phone',
  scanned: 'QR scanned — establishing secure connection...',
  syncing: 'Connected — syncing message history...',
  connected: 'Connected',
  error: 'Connection failed',
};

/**
 * Reusable QR code pairing component with streaming status updates.
 * Subscribes to a session row via Supabase realtime, renders QR when available,
 * and shows animated progress through the pairing flow.
 */
export function QrAuthConnect({ sessionId, serviceName, onConnected, onError }: QrAuthConnectProps) {
  const [phase, setPhase] = useState<PairingPhase>('loading');
  const [qrData, setQrData] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevStatusRef = useRef<string | null>(null);

  const addLog = useCallback((msg: string) => {
    setStatusLog(prev => [...prev.slice(-4), msg]);
  }, []);

  const handleRowUpdate = useCallback((dbStatus: string, qr: string | null, phone: string | null) => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = dbStatus;

    setQrData(qr);
    setPhoneNumber(phone);

    if (dbStatus === 'pairing' && qr) {
      if (prev !== 'pairing' || phase === 'loading' || phase === 'qr_waiting') {
        setPhase('qr_ready');
        addLog('QR code ready — scan with your phone');
      }
    } else if (dbStatus === 'pairing' && !qr && prev === 'pairing') {
      // QR was cleared after scan — handshake in progress
      setPhase('scanned');
      addLog('QR scanned — negotiating encryption...');
    } else if (dbStatus === 'pairing' && !qr) {
      setPhase('qr_waiting');
      addLog('Waiting for QR from bridge...');
    } else if (dbStatus === 'connected') {
      if (phase !== 'connected') {
        // Brief syncing phase before final connected
        setPhase('syncing');
        addLog('Secure connection established');
        if (phone) addLog(`Phone: ${phone}`);
        setTimeout(() => {
          setPhase('connected');
          if (phone) onConnected?.(phone);
        }, 1500);
      }
    } else if (dbStatus === 'disconnected' && prev === 'pairing') {
      // Transient reconnect during pairing — don't show error
      addLog('Reconnecting...');
    } else if (dbStatus === 'error') {
      setPhase('error');
      addLog('Connection failed');
      onError?.('Connection failed. Please try again.');
    }
  }, [phase, addLog, onConnected, onError]);

  useEffect(() => {
    const client = createClient();
    if (!client) return;

    addLog('Connecting to bridge...');

    // Initial fetch
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

    // Realtime subscription
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

  // Render QR code on canvas when qrData changes
  useEffect(() => {
    if (!qrData || !canvasRef.current) return;

    import('qrcode').then((QRCode) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      QRCode.toCanvas(canvas, qrData, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = 256;
          canvas.height = 256;
          ctx.drawImage(img, 0, 0, 256, 256);
        };
        img.src = qrData;
      });
    });
  }, [qrData]);

  const phaseIcon = {
    loading: <Loader2 size={20} style={{ animation: 'bb-spin 1s linear infinite', color: 'var(--text-secondary)' }} />,
    qr_waiting: <Loader2 size={20} style={{ animation: 'bb-spin 1s linear infinite', color: 'var(--text-secondary)' }} />,
    qr_ready: <Smartphone size={20} style={{ color: '#25D366' }} />,
    scanned: <ShieldCheck size={20} style={{ animation: 'bb-spin 1s linear infinite', color: '#25D366' }} />,
    syncing: <Wifi size={20} style={{ animation: 'pulse 1.5s ease-in-out infinite', color: '#25D366' }} />,
    connected: <CheckCircle size={20} style={{ color: '#22C55E' }} />,
    error: <XCircle size={20} style={{ color: '#EF4444' }} />,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>

      {/* QR Code area */}
      {(phase === 'qr_ready' || phase === 'qr_waiting') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {qrData ? (
            <div style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#ffffff',
              padding: 8,
              transition: 'opacity 300ms',
            }}>
              <canvas ref={canvasRef} width={256} height={256} />
            </div>
          ) : (
            <div style={{
              width: 272, height: 272, borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader2 size={32} style={{ animation: 'bb-spin 1s linear infinite', color: 'var(--text-secondary)' }} />
            </div>
          )}
          {qrData && (
            <p style={{ maxWidth: 280, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
              Open {serviceName} → Linked Devices → Link a Device → Scan this code
            </p>
          )}
        </div>
      )}

      {/* Scanned / syncing / connected animation */}
      {(phase === 'scanned' || phase === 'syncing' || phase === 'connected') && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          padding: '24px 0',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: phase === 'connected'
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(37, 211, 102, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 500ms ease',
            transform: phase === 'connected' ? 'scale(1.1)' : 'scale(1)',
          }}>
            {phase === 'connected'
              ? <CheckCircle size={32} style={{ color: '#22C55E' }} />
              : phase === 'syncing'
                ? <Wifi size={28} style={{ color: '#25D366' }} />
                : <Link size={28} style={{ animation: 'bb-spin 2s linear infinite', color: '#25D366' }} />
            }
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {PHASE_LABELS[phase]}
          </p>
          {phoneNumber && phase === 'connected' && (
            <p style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
              +{phoneNumber}
            </p>
          )}
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 0' }}>
          <XCircle size={32} style={{ color: '#EF4444' }} />
          <p style={{ fontSize: 14, color: '#EF4444' }}>Connection failed</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Please try again</p>
        </div>
      )}

      {/* Streaming status log */}
      <div style={{
        width: '100%',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: 12,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 4,
        }}>
          {phaseIcon[phase]}
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: phase === 'error' ? '#EF4444'
              : phase === 'connected' ? '#22C55E'
              : 'var(--text-secondary)',
            transition: 'color 300ms',
          }}>
            {PHASE_LABELS[phase]}
          </span>
        </div>
        {statusLog.map((msg, i) => (
          <div
            key={`${msg}-${i}`}
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'var(--text-tertiary, rgba(255,255,255,0.35))',
              paddingLeft: 26,
              opacity: i === statusLog.length - 1 ? 0.8 : 0.4,
              transition: 'opacity 300ms',
            }}
          >
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
}

export default QrAuthConnect;
