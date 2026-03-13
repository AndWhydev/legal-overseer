'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Paperclip } from 'lucide-react';
import { MiniWaveform } from '../ui/mini-waveform';

export type PillMode = 'hidden' | 'voice' | 'text' | 'processing' | 'response';
export type PillMorphPhase = 'to-floating' | 'to-docked';

interface VoicePillProps {
  mode: PillMode;
  docked?: boolean;
  compactDocked?: boolean;
  morphing?: boolean;
  morphPhase?: PillMorphPhase | null;
  morphShift?: number;
  floatingAnchor?: { x: number; y: number } | null;
  frequencyData: Uint8Array | null;
  transcription: string | null;
  response: string | null;
  error: string | null;
  onTextSubmit: (query: string) => void;
  onDismiss: () => void;
}

export function VoicePill({
  mode,
  docked = false,
  compactDocked = false,
  morphing = false,
  morphPhase = null,
  morphShift = 0,
  floatingAnchor = null,
  frequencyData,
  transcription,
  response,
  error,
  onTextSubmit,
  onDismiss,
}: VoicePillProps) {
  const [textValue, setTextValue] = useState('');
  const [displayMode, setDisplayMode] = useState<PillMode>('hidden');
  const [isExiting, setIsExiting] = useState(false);
  const [isDockedExpanded, setIsDockedExpanded] = useState(false);
  const prevModeRef = useRef<PillMode>('hidden');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;

    if (mode === 'hidden' && prevMode !== 'hidden') {
      if (docked) {
        setIsExiting(false);
        setDisplayMode('text');
      } else {
        setIsExiting(true);
      }
    } else {
      setIsExiting(false);
      setDisplayMode(mode);
    }
  }, [mode, docked]);

  useEffect(() => {
    if (!isExiting) return;

    const pill = pillRef.current;
    if (!pill) {
      setIsExiting(false);
      setDisplayMode('hidden');
      return;
    }

    const onEnd = (e: AnimationEvent) => {
      if (e.animationName === 'pill-exit' || e.animationName === 'pill-chat-anchor-exit') {
        setIsExiting(false);
        setDisplayMode('hidden');
      }
    };

    pill.addEventListener('animationend', onEnd);
    return () => pill.removeEventListener('animationend', onEnd);
  }, [isExiting]);

  useEffect(() => {
    if (mode === 'text' || (docked && displayMode === 'text')) {
      setTextValue('');
      setTimeout(() => {
        if (docked) {
          textareaRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      }, 50);
    }
  }, [mode, docked, displayMode]);

  useEffect(() => {
    if (!docked || displayMode !== 'text') return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    const minHeight = compactDocked && !isDockedExpanded ? 52 : 88;
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), 188);
    textarea.style.height = `${nextHeight}px`;
  }, [textValue, docked, displayMode, compactDocked, isDockedExpanded]);

  useEffect(() => {
    if (!docked) {
      setIsDockedExpanded(false);
      return;
    }
    if (!compactDocked) {
      setIsDockedExpanded(true);
      return;
    }
    if (displayMode !== 'text') return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const style = window.getComputedStyle(textarea);
    const parsedLineHeight = Number.parseFloat(style.lineHeight || '');
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 24;
    const twoLineThreshold = lineHeight * 2;
    const shouldExpand = textarea.scrollHeight > (twoLineThreshold + 8);
    setIsDockedExpanded(shouldExpand);
  }, [textValue, docked, displayMode, compactDocked]);

  useEffect(() => {
    if (docked && displayMode === 'hidden') {
      setDisplayMode('text');
    }
  }, [docked, displayMode]);

  useEffect(() => {
    if (mode === 'response') {
      dismissTimerRef.current = setTimeout(onDismiss, 5000);
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }
  }, [mode, onDismiss]);

  const handleSubmit = useCallback(() => {
    const q = textValue.trim();
    if (!q) return;
    onTextSubmit(q);
    setTextValue('');
  }, [textValue, onTextSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape' && !docked) {
      e.preventDefault();
      onDismiss();
    }
  }, [handleSubmit, onDismiss, docked]);

  const renderMode = isExiting ? prevModeRef.current : displayMode;
  const effectiveMode = docked && renderMode === 'hidden' ? 'text' : renderMode;
  const isVisible = effectiveMode !== 'hidden';

  const pillClass = [
    'bb-pill',
    docked && 'bb-pill--docked',
    docked && compactDocked && !isDockedExpanded && 'bb-pill--docked-compact',
    docked && (!compactDocked || isDockedExpanded) && 'bb-pill--docked-expanded',
    floatingAnchor && !docked && 'bb-pill--chat-anchored',
    morphPhase === 'to-floating' && !docked && 'bb-pill--morph-to-floating',
    morphPhase === 'to-docked' && docked && 'bb-pill--morph-to-docked',
    morphing && !docked && 'bb-pill--snap-morph',
    effectiveMode === 'voice' && 'bb-pill--voice',
    effectiveMode === 'text' && (docked ? 'bb-pill--text-docked' : 'bb-pill--text'),
    effectiveMode === 'processing' && 'bb-pill--processing',
    effectiveMode === 'response' && 'bb-pill--response',
    isVisible && !isExiting && (docked ? 'bb-pill--docked-visible' : 'bb-pill--visible'),
    isExiting && 'bb-pill--exiting',
  ].filter(Boolean).join(' ');

  const styleVars: Record<string, string> = {};
  if (Math.abs(morphShift) > 0.5) {
    styleVars['--bb-pill-morph-shift'] = `${morphShift.toFixed(2)}px`;
  }
  if (floatingAnchor && !docked) {
    styleVars['--bb-pill-anchor-left'] = `${floatingAnchor.x.toFixed(2)}px`;
    styleVars['--bb-pill-anchor-top'] = `${floatingAnchor.y.toFixed(2)}px`;
  }
  const pillStyle = Object.keys(styleVars).length > 0
    ? (styleVars as React.CSSProperties)
    : undefined;

  return (
    <div
      ref={pillRef}
      className={pillClass}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="BitBit AI"
      style={pillStyle}
      aria-hidden={!isVisible}
    >
      {effectiveMode === 'voice' && (
        <MiniWaveform
          frequencyData={frequencyData}
          barCount={24}
          isActive={true}
        />
      )}

      {effectiveMode === 'processing' && (
        <div className="bb-pill__shimmer-track">
          <div className="bb-pill__shimmer-dots">
            <span /><span /><span />
          </div>
        </div>
      )}

      {effectiveMode === 'text' && (
        <>
          {docked ? (
            <>
              <textarea
                ref={textareaRef}
                className="bb-pill__textarea"
                placeholder="Message BitBit..."
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
                rows={1}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  WebkitAppearance: 'none',
                }}
              />
              <div className="bb-pill__actions">
                <button
                  className="bb-pill__attach"
                  aria-label="Attach file"
                  type="button"
                >
                  <Paperclip size={18} />
                </button>
                <button
                  className="bb-pill__send"
                  onClick={handleSubmit}
                  aria-label="Send"
                  disabled={!textValue.trim()}
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                ref={inputRef}
                className="bb-pill__input"
                type="text"
                placeholder="Ask BitBit…"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="bb-pill__send"
                onClick={handleSubmit}
                aria-label="Send"
                disabled={!textValue.trim()}
              >
                <ArrowUp size={14} />
              </button>
            </>
          )}
        </>
      )}

      {effectiveMode === 'response' && (
        <div className="bb-pill__response">
          {error ? (
            <span className="bb-pill__error">{error}</span>
          ) : (
            <>
              {transcription && (
                <p className="bb-pill__transcription">&ldquo;{transcription}&rdquo;</p>
              )}
              <p className="bb-pill__response-text">{response}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
