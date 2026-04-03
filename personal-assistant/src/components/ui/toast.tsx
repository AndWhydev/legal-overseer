'use client';

import React, { createContext, useCallback, useContext, useState, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { toast: () => {} } as ToastContextValue;
  }
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-[var(--bb-green)]" aria-hidden="true" />,
  error: <AlertCircle className="h-4 w-4 text-[var(--bb-red)]" aria-hidden="true" />,
  info: <Info className="h-4 w-4 text-[var(--bb-blue)]" aria-hidden="true" />,
};

// Toast uses inline glass styling — no border classes needed
const _BORDER_COLORS_UNUSED = null;

const AUTO_DISMISS_MS: Record<ToastType, number | null> = {
  success: 4000,
  info: 5000,
  error: null, // errors persist until manually dismissed
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);
  const recentRef = useRef<Map<string, number>>(new Map());

  // Cleanup stale dedup entries every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, ts] of recentRef.current) {
        if (now - ts > 5000) recentRef.current.delete(key);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    // Dedup: skip if same type+message within 2s
    const dedupKey = `${type}:${message}`;
    const lastSeen = recentRef.current.get(dedupKey);
    if (lastSeen && Date.now() - lastSeen < 2000) return;
    recentRef.current.set(dedupKey, Date.now());

    const id = `toast-${++counterRef.current}`;
    setToasts(prev => [...prev, { id, type, message }]);

    const ttl = AUTO_DISMISS_MS[type];
    if (ttl !== null) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, ttl);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Polite announcements for success/info */}
      <div
        className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        role="status"
      >
        {toasts.filter(t => t.type !== 'error').map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderRadius: 16,
              border: 'none',
              background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.95))',
              backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
              WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
              boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
              padding: '12px 16px',
              fontSize: 14,
              color: 'var(--text-primary, #F1F5F9)',
              animation: 'bb-fade-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-2 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {/* Assertive announcements for errors */}
      <div
        className="fixed bottom-4 right-4 z-[201] flex flex-col gap-2 pointer-events-none"
        aria-live="assertive"
        role="alert"
      >
        {toasts.filter(t => t.type === 'error').map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderRadius: 16,
              border: 'none',
              background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.95))',
              backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
              WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
              boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
              padding: '12px 16px',
              fontSize: 14,
              color: 'var(--text-primary, #F1F5F9)',
              animation: 'bb-fade-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-2 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
