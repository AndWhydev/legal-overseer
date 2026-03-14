'use client';

import React, { createContext, useCallback, useContext, useState, useRef, useEffect } from 'react';
import { SFCheckmarkCircle, SFExclamationmarkCircle, SFInfoCircle, SFXmark } from 'sf-symbols-lib';
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
  success: <SFCheckmarkCircle className="h-4 w-4 text-[var(--bb-green)]" aria-hidden="true" />,
  error: <SFExclamationmarkCircle className="h-4 w-4 text-[var(--bb-red)]" aria-hidden="true" />,
  info: <SFInfoCircle className="h-4 w-4 text-[var(--bb-blue)]" aria-hidden="true" />,
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: 'border-[var(--bb-green)]/30',
  error: 'border-[var(--bb-red)]/30',
  info: 'border-[var(--bb-blue)]/30',
};

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
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-card/95 backdrop-blur-md px-4 py-3 text-sm text-foreground shadow-lg animate-in slide-in-from-right-5 fade-in duration-200',
              BORDER_COLORS[t.type],
            )}
          >
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
              aria-label="Dismiss notification"
            >
              <SFXmark className="h-3.5 w-3.5" />
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
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-card/95 backdrop-blur-md px-4 py-3 text-sm text-foreground shadow-lg animate-in slide-in-from-right-5 fade-in duration-200',
              BORDER_COLORS[t.type],
            )}
          >
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
              aria-label="Dismiss error"
            >
              <SFXmark className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
