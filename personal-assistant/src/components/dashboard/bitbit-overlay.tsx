'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { VoicePill } from './voice-pill';
import type { PillMode } from './voice-pill';
import { useVoiceRecording } from '../../hooks/use-voice-recording';
import { useVoicePlayback } from '../../hooks/use-voice-playback';

interface BitBitOverlayProps {
  children: React.ReactNode;
  currentPage?: string;
  currentContext?: string;
  activeTabId?: string;
}

type PillMorphPhase = 'to-floating' | 'to-docked';
type ChatLayoutDetail = { started: boolean };
type DockMetrics = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

const CHAT_SEND_EVENT = 'bitbit-chat-send';
const CHAT_LAYOUT_EVENT = 'bitbit-chat-layout';

function dispatchChatSend(text: string) {
  window.dispatchEvent(new CustomEvent(CHAT_SEND_EVENT, { detail: text }));
}

function isTriggerKeyDown(e: KeyboardEvent): boolean {
  if (e.key === 'Fn') return true;
  if (e.key === 'Control' && e.location === 1) return true;
  return false;
}

function isTriggerKeyUp(e: KeyboardEvent): boolean {
  if (e.key === 'Fn') return true;
  if (e.key === 'Control' && e.location === 1) return true;
  return false;
}

export function BitBitOverlay({
  children,
  currentContext,
  activeTabId,
}: BitBitOverlayProps) {
  const [pillMode, setPillMode] = useState<PillMode>('hidden');
  const [transcription, setTranscription] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  const [dockMetrics, setDockMetrics] = useState<DockMetrics | null>(null);
  const [forceFloating, setForceFloating] = useState(false);
  const [chatSessionStarted, setChatSessionStarted] = useState(false);
  const [pillMorphPhase, setPillMorphPhase] = useState<PillMorphPhase | null>(null);
  const [pillMorphShift, setPillMorphShift] = useState(0);

  const isChatTab = activeTabId === 'chat';
  const isDocked = isChatTab && !forceFloating;
  const voice = useVoiceRecording();
  const playback = useVoicePlayback();
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);

  // Listen for chat response completions to speak via TTS
  useEffect(() => {
    if (!voiceModeEnabled) return;

    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text && typeof text === 'string') {
        // Strip markdown/code blocks for cleaner speech
        const cleaned = text
          .replace(/```[\s\S]*?```/g, '')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/#{1,6}\s+/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[-*+]\s+/g, '')
          .trim();
        if (cleaned) {
          playback.speak(cleaned).catch(() => {});
        }
      }
    };

    window.addEventListener('bitbit-chat-response-done', handler);
    return () => window.removeEventListener('bitbit-chat-response-done', handler);
  }, [voiceModeEnabled, playback]);

  useEffect(() => {
    if (!isChatTab) {
      setForceFloating(false);
      setDockMetrics(null);
      setChatSessionStarted(false);
      setPillMorphPhase(null);
      setPillMorphShift(0);
    }
  }, [isChatTab]);

  const morphResetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const measureDockMetrics = useCallback((target?: HTMLElement | null): DockMetrics | null => {
    const dock = target ?? dockEl ?? document.getElementById('pill-dock');
    if (!dock) {
      setDockMetrics(null);
      return null;
    }

    const rect = dock.getBoundingClientRect();
    let centerX = rect.left + (rect.width / 2);
    let centerY = rect.top + (rect.height / 2);
    let width = rect.width;
    let height = rect.height;

    if (height < 1) {
      const host = dock.parentElement;
      if (host) {
        const hostRect = host.getBoundingClientRect();
        centerX = hostRect.left + (hostRect.width / 2);
        centerY = hostRect.top + (hostRect.height / 2);
        width = hostRect.width;
        height = hostRect.height;
      }
    }

    const next: DockMetrics = {
      centerX,
      centerY,
      width,
      height,
    };

    setDockMetrics((prev) => {
      if (
        prev
        && Math.abs(prev.centerX - next.centerX) < 0.5
        && Math.abs(prev.centerY - next.centerY) < 0.5
        && Math.abs(prev.width - next.width) < 0.5
        && Math.abs(prev.height - next.height) < 0.5
      ) {
        return prev;
      }
      return next;
    });

    return next;
  }, [dockEl]);

  useEffect(() => {
    if (!isChatTab) return;

    const onLayoutChange = (event: Event) => {
      const detail = (event as CustomEvent<ChatLayoutDetail>).detail;
      setChatSessionStarted(Boolean(detail?.started));
    };

    window.addEventListener(CHAT_LAYOUT_EVENT, onLayoutChange as EventListener);
    return () => {
      window.removeEventListener(CHAT_LAYOUT_EVENT, onLayoutChange as EventListener);
    };
  }, [isChatTab]);

  const beginChatMorph = useCallback((phase: PillMorphPhase) => {
    if (!isChatTab) return;

    // Pre-session in chat: floating summon remains aligned to the dock center.
    if (!chatSessionStarted) {
      setPillMorphPhase(null);
      setPillMorphShift(0);
      return;
    }

    const dock = dockEl ?? document.getElementById('pill-dock');
    if (!dock) {
      setPillMorphPhase(null);
      setPillMorphShift(0);
      return;
    }

    const metrics = measureDockMetrics(dock);
    if (!metrics) {
      setPillMorphPhase(null);
      setPillMorphShift(0);
      return;
    }

    const shift = metrics.centerX - (window.innerWidth / 2);

    if (Math.abs(shift) < 0.5) {
      setPillMorphPhase(null);
      setPillMorphShift(0);
      return;
    }

    setPillMorphShift(shift);
    setPillMorphPhase(phase);

    if (morphResetTimerRef.current) clearTimeout(morphResetTimerRef.current);
    morphResetTimerRef.current = setTimeout(() => {
      setPillMorphPhase(null);
      setPillMorphShift(0);
      morphResetTimerRef.current = undefined;
    }, 130);
  }, [chatSessionStarted, dockEl, isChatTab, measureDockMetrics]);

  useEffect(() => {
    if (!isChatTab) {
      setDockEl(null);
      setDockMetrics(null);
      return;
    }

    let rafId: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let removeListeners: (() => void) | undefined;
    let observer: MutationObserver | null = null;

    const attachListeners = (el: HTMLElement) => {
      setDockEl(el);

      const queueMeasure = () => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          measureDockMetrics(el);
        });
      };

      queueMeasure();

      const host = el.parentElement;
      const onResize = () => queueMeasure();
      const onTransition = () => queueMeasure();

      window.addEventListener('resize', onResize);
      host?.addEventListener('transitionrun', onTransition);
      host?.addEventListener('transitionend', onTransition);

      settleTimer = setTimeout(queueMeasure, 260);

      removeListeners = () => {
        window.removeEventListener('resize', onResize);
        host?.removeEventListener('transitionrun', onTransition);
        host?.removeEventListener('transitionend', onTransition);
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = undefined;
        }
      };
    };

    // Try synchronous lookup first
    const el = document.getElementById('pill-dock');
    if (el) {
      attachListeners(el);
    } else {
      // Element not in DOM yet (Suspense fallback showing).
      // Use MutationObserver to catch it the moment it appears.
      observer = new MutationObserver(() => {
        const found = document.getElementById('pill-dock');
        if (found) {
          observer?.disconnect();
          observer = null;
          attachListeners(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      removeListeners?.();
      observer?.disconnect();
    };
    // Note: measureDockMetrics intentionally excluded — it depends on dockEl
    // which would cause circular effect restarts. Metrics are measured via
    // the dedicated effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatTab]);

  useEffect(() => {
    if (!isChatTab) return;

    const rafId = window.requestAnimationFrame(() => {
      measureDockMetrics();
    });
    const settleTimer = setTimeout(() => {
      measureDockMetrics();
    }, 260);

    return () => {
      window.cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
    };
  }, [isChatTab, chatSessionStarted, forceFloating, isDocked, measureDockMetrics]);

  const lastTriggerRef = useRef<number>(0);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isVoiceActiveRef = useRef(false);
  const isHoldingRef = useRef(false);
  const comboKeyPressedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (morphResetTimerRef.current) clearTimeout(morphResetTimerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    setPillMode('hidden');
    setTranscription(null);
    setResponse(null);
    setError(null);
    isVoiceActiveRef.current = false;
    isHoldingRef.current = false;
    playback.stop();

    if (isChatTab) {
      if (forceFloating) beginChatMorph('to-docked');
      setForceFloating(false);
    }

    if (doubleTapTimerRef.current) {
      clearTimeout(doubleTapTimerRef.current);
      doubleTapTimerRef.current = undefined;
    }
  }, [beginChatMorph, forceFloating, isChatTab]);

  const startVoice = useCallback(async () => {
    // Pre-check: is getUserMedia available at all?
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice input is not available in this browser');
      setPillMode('response');
      return;
    }

    if (isChatTab && !forceFloating) {
      beginChatMorph('to-floating');
      setForceFloating(true);
    }

    setPillMode('voice');
    setTranscription(null);
    setResponse(null);
    setError(null);
    isVoiceActiveRef.current = true;

    await voice.startRecording();
    if (voice.error) {
      setError(voice.error);
      setPillMode('response');
      isVoiceActiveRef.current = false;
    }
  }, [beginChatMorph, forceFloating, isChatTab, voice]);

  const stopVoiceAndProcess = useCallback(async () => {
    if (!isVoiceActiveRef.current) return;

    isVoiceActiveRef.current = false;
    setPillMode('processing');

    const blob = await voice.stopRecording();
    if (!blob) {
      setError('No audio recorded');
      setPillMode('response');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const res = await fetch('/api/ai/voice', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Voice API error');

      const data = await res.json() as { transcript: string; response: string };
      setTranscription(data.transcript);
      setResponse(data.response);
      setPillMode('response');

      // Speak the response via TTS if voice mode is enabled
      if (voiceModeEnabled && data.response) {
        playback.speak(data.response).catch(() => {});
      }
    } catch {
      setError('Failed to process voice input');
      setPillMode('response');
    }
  }, [voice, voiceModeEnabled, playback]);

  const cancelVoice = useCallback(() => {
    isVoiceActiveRef.current = false;
    voice.stopRecording().catch(() => {});
  }, [voice]);

  const handleTextSubmit = useCallback(async (query: string) => {
    if (isChatTab) {
      dispatchChatSend(query);

      if (forceFloating) {
        beginChatMorph('to-docked');
        setPillMode('hidden');
        setForceFloating(false);
      }
      return;
    }

    setPillMode('processing');

    try {
      const res = await fetch('/api/ai/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: currentContext }),
      });
      const data = await res.json() as { response: string };
      setResponse(data.response);
      setPillMode('response');
    } catch {
      setError('Something went wrong. Try again.');
      setPillMode('response');
    }
  }, [beginChatMorph, currentContext, forceFloating, isChatTab]);

  useEffect(() => {
    const DOUBLE_TAP_MS = 300;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pillMode !== 'hidden') {
        e.preventDefault();
        if (isVoiceActiveRef.current) cancelVoice();
        dismiss();
        return;
      }

      if (e.key !== 'Control' && e.key !== 'Fn' && e.ctrlKey) {
        comboKeyPressedRef.current = true;
        return;
      }

      if (!isTriggerKeyDown(e) || e.repeat) return;

      // Disable quick-summon entirely on the chat page — chat has its own input
      if (isChatTab) return;

      comboKeyPressedRef.current = false;
      const now = Date.now();
      const gap = now - lastTriggerRef.current;
      lastTriggerRef.current = now;

      if (gap < DOUBLE_TAP_MS) {
        // ── Double-tap: open text input (no microphone needed) ──
        if (doubleTapTimerRef.current) {
          clearTimeout(doubleTapTimerRef.current);
          doubleTapTimerRef.current = undefined;
        }

        if (isVoiceActiveRef.current) cancelVoice();
        isHoldingRef.current = false;

        if (isChatTab && !forceFloating) {
          beginChatMorph('to-floating');
          setForceFloating(true);
        }
        setError(null);
        setPillMode('text');
        return;
      }

      // ── First tap: wait to see if a second tap follows ──
      // Don't start voice yet — defer until the double-tap window expires.
      isHoldingRef.current = true;

      doubleTapTimerRef.current = setTimeout(() => {
        doubleTapTimerRef.current = undefined;
        // No second tap arrived — commit to voice (hold-to-talk).
        // Only start if still holding (keyUp hasn't fired).
        if (isHoldingRef.current) {
          startVoice();
        }
      }, DOUBLE_TAP_MS);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isTriggerKeyUp(e)) return;

      if (comboKeyPressedRef.current) {
        comboKeyPressedRef.current = false;
        return;
      }

      if (!isHoldingRef.current) return;
      isHoldingRef.current = false;

      // If the double-tap timer is still running, the user released quickly.
      // This was a tap-and-release (not a hold). Wait for the timer to expire
      // to decide: if another keydown arrives → double-tap → text mode.
      // If not → it was a short press (too short for voice). Do nothing.
      if (doubleTapTimerRef.current) {
        // Cancel deferred voice start — key was released too quickly for hold-to-talk
        clearTimeout(doubleTapTimerRef.current);
        doubleTapTimerRef.current = setTimeout(() => {
          doubleTapTimerRef.current = undefined;
          // Timer expired with no second tap and key already released.
          // This was a single quick tap — not enough for voice. Ignore.
        }, DOUBLE_TAP_MS);
        return;
      }

      // Double-tap window has passed and key released — stop voice recording.
      if (isVoiceActiveRef.current) {
        stopVoiceAndProcess();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pillMode, dismiss, startVoice, stopVoiceAndProcess, cancelVoice, beginChatMorph, forceFloating, isChatTab]);

  useEffect(() => {
    if (pillMode === 'hidden' || isDocked) return;

    const onClick = (e: MouseEvent) => {
      const pill = document.querySelector('[data-voice-pill]');
      if (pill && !pill.contains(e.target as Node)) {
        if (isVoiceActiveRef.current) cancelVoice();
        dismiss();
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener('click', onClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', onClick);
    };
  }, [pillMode, dismiss, cancelVoice, isDocked]);

  const shouldAnchorFloating = isChatTab && forceFloating && !chatSessionStarted && Boolean(dockMetrics);

  const pill = (
    <VoicePill
      mode={pillMode}
      docked={isDocked}
      compactDocked={isChatTab}
      morphing={isChatTab && forceFloating && pillMorphPhase !== 'to-floating' && !shouldAnchorFloating}
      morphPhase={isChatTab ? pillMorphPhase : null}
      morphShift={isChatTab ? pillMorphShift : 0}
      floatingAnchor={shouldAnchorFloating && dockMetrics
        ? { x: dockMetrics.centerX, y: dockMetrics.centerY }
        : null}
      frequencyData={voice.frequencyData}
      transcription={transcription}
      response={response}
      error={error || voice.error}
      onTextSubmit={handleTextSubmit}
      onDismiss={dismiss}
      voiceModeEnabled={voiceModeEnabled}
      onVoiceModeToggle={() => setVoiceModeEnabled(prev => !prev)}
      isSpeaking={playback.isSpeaking}
    />
  );

  // Resolve dock target: prefer cached dockEl, fall back to synchronous DOM lookup.
  // This eliminates the race where the effect hasn't set dockEl yet after tab switch.
  const dockTarget = isDocked
    ? (dockEl ?? (typeof document !== 'undefined' ? document.getElementById('pill-dock') : null))
    : null;

  return (
    <>
      {children}
      {isDocked ? (dockTarget ? createPortal(pill, dockTarget) : null) : pill}
    </>
  );
}

export default BitBitOverlay;