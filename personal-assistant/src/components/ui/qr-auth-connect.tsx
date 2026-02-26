'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle, XCircle, Smartphone } from 'lucide-react';

interface QrAuthConnectProps {
  sessionId: string;
  serviceName: string;
  onConnected?: (phoneNumber: string) => void;
  onError?: (error: string) => void;
}

/**
 * Reusable QR code pairing component.
 * Subscribes to a session row via Supabase realtime, renders QR when available,
 * and shows connected state when pairing completes.
 */
export function QrAuthConnect({ sessionId, serviceName, onConnected, onError }: QrAuthConnectProps) {
  const [status, setStatus] = useState<'loading' | 'qr_pending' | 'connected' | 'error'>('loading');
  const [qrData, setQrData] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const client = createClient();
    if (!client) return;

    // Initial fetch
    client
      .from('whatsapp_sessions')
      .select('status, qr_data, phone_number')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        if (data) {
          setStatus(data.status as typeof status);
          setQrData(data.qr_data);
          setPhoneNumber(data.phone_number);
          if (data.status === 'connected' && data.phone_number) {
            onConnected?.(data.phone_number);
          }
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
          setStatus(row.status);
          setQrData(row.qr_data);
          setPhoneNumber(row.phone_number);

          if (row.status === 'connected' && row.phone_number) {
            onConnected?.(row.phone_number);
          }
          if (row.status === 'error') {
            onError?.('Connection failed. Please try again.');
          }
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [sessionId, onConnected, onError]);

  // Render QR code on canvas when qrData changes
  useEffect(() => {
    if (!qrData || !canvasRef.current) return;

    // Simple QR rendering: qrData is a base64 data URL from the worker
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = 256;
      canvas.height = 256;
      ctx.drawImage(img, 0, 0, 256, 256);
    };
    img.src = qrData;
  }, [qrData]);

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <Smartphone size={24} className="text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">
        Connect {serviceName}
      </h3>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Generating QR code...</p>
        </div>
      )}

      {status === 'qr_pending' && qrData && (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-lg border border-border/50 bg-white p-2">
            <canvas ref={canvasRef} width={256} height={256} />
          </div>
          <p className="max-w-[280px] text-center text-xs text-muted-foreground">
            Open {serviceName} on your phone → Linked Devices → Link a Device → Scan this QR code
          </p>
        </div>
      )}

      {status === 'qr_pending' && !qrData && (
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Waiting for QR code from bridge...</p>
        </div>
      )}

      {status === 'connected' && (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle size={32} className="text-green-500" />
          <p className="text-sm font-medium text-foreground">Connected</p>
          {phoneNumber && (
            <p className="text-xs text-muted-foreground font-mono">{phoneNumber}</p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2">
          <XCircle size={32} className="text-destructive" />
          <p className="text-sm text-destructive">Connection failed</p>
          <p className="text-xs text-muted-foreground">Please try again</p>
        </div>
      )}
    </div>
  );
}

export default QrAuthConnect;
