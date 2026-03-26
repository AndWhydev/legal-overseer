'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp, FileText, Loader2, Mic, MicOff, Paperclip, X } from 'lucide-react';
import { MiniWaveform } from '../ui/mini-waveform';
import { useFileUpload, type UploadItem } from '@/hooks/use-file-upload';
import { useVoiceInput } from '../chat/use-voice-input';
import { CommandPalette, DEFAULT_CHAT_COMMANDS, type ChatCommand } from '../chat/command-palette';

export type PillMode = 'hidden' | 'voice' | 'text' | 'processing' | 'response';
export type PillMorphPhase = 'to-floating' | 'to-docked';

/** Custom event for delivering attachment IDs alongside text messages */
export const CHAT_ATTACHMENTS_EVENT = 'bitbit-chat-attachments';

/** Custom event for slash commands */
export const CHAT_COMMAND_EVENT = 'bitbit-chat-command';

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
  threadId?: string | null;
  onCommandSelect?: (commandId: string) => void;
}

/** File input accept filter matching ALLOWED_MIME_TYPES */
const FILE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.docx,.txt,.csv';

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
  threadId,
  onCommandSelect,
}: VoicePillProps) {
  const [textValue, setTextValue] = useState('');
  const [displayMode, setDisplayMode] = useState<PillMode>('hidden');
  const [isExiting, setIsExiting] = useState(false);
  const [isDockedExpanded, setIsDockedExpanded] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const prevModeRef = useRef<PillMode>('hidden');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pillRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload hook
  const fileUpload = useFileUpload(threadId);

  // Voice input hook
  const voice = useVoiceInput((text) => {
    setTextValue(text);
  });

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
    if (!q && fileUpload.readyAttachmentIds.length === 0) return;
    if (fileUpload.isUploading) return; // Don't send while uploads in progress

    // Dispatch attachment metadata via custom event before the text submit.
    // The chat-interface listens for this event and includes the IDs in the request.
    if (fileUpload.readyAttachmentIds.length > 0) {
      const readyUploads = fileUpload.uploads.filter(u => u.status === 'ready')
      window.dispatchEvent(
        new CustomEvent(CHAT_ATTACHMENTS_EVENT, {
          detail: {
            ids: fileUpload.readyAttachmentIds,
            items: readyUploads.map(u => ({
              attachmentId: u.id,
              type: u.mimeType,
              name: u.filename,
              url: '',
            })),
          },
        })
      );
    }

    onTextSubmit(q || '(attached files)');
    setTextValue('');
    fileUpload.clearUploads();
  }, [textValue, onTextSubmit, fileUpload]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape' && !docked) {
      e.preventDefault();
      onDismiss();
    }
  }, [handleSubmit, onDismiss, docked]);

  const handlePaperclipClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      fileUpload.addFiles(files);
    }
    // Reset file input so the same file can be selected again
    e.target.value = '';
  }, [fileUpload]);

  const handleCommandSelect = useCallback((cmd: ChatCommand) => {
    setShowCommands(false);
    setTextValue('');
    setCommandQuery('');
    // Dispatch event for chat-interface to handle
    window.dispatchEvent(new CustomEvent(CHAT_COMMAND_EVENT, { detail: cmd.id }));
    // Also call the optional callback
    onCommandSelect?.(cmd.id);
  }, [onCommandSelect]);

  const renderMode = isExiting ? prevModeRef.current : displayMode;
  const effectiveMode = docked && renderMode === 'hidden' ? 'text' : renderMode;
  const isVisible = effectiveMode !== 'hidden';

  const hasUploads = fileUpload.uploads.length > 0;
  const canSend = textValue.trim() || fileUpload.readyAttachmentIds.length > 0;

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
          {/* Hidden file input for Paperclip button */}
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-hidden="true"
          />

          {docked ? (
            <>
              {/* Upload progress indicators */}
              {hasUploads && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '8px 12px 0',
                  width: '100%',
                }}>
                  <style>{`
                    @keyframes bb-upload-spin {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                  {fileUpload.uploads.map((item) => (
                    <UploadProgressItem
                      key={item.id}
                      item={item}
                      onRemove={() => fileUpload.removeUpload(item.id)}
                    />
                  ))}
                </div>
              )}

              {/* Command palette container - positioned relative to contain absolute-positioned palette */}
              <div style={{ position: 'relative', width: '100%' }}>
                <textarea
                ref={textareaRef}
                className="bb-pill__textarea"
                placeholder="Message BitBit..."
                value={textValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setTextValue(val);
                  if (val.startsWith('/') && val.length > 1) {
                    setShowCommands(true);
                    setCommandQuery(val.slice(1));
                  } else {
                    setShowCommands(false);
                    setCommandQuery('');
                  }
                }}
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

                {/* Command palette - appears above the textarea */}
                <AnimatePresence>
                  {showCommands && (
                    <CommandPalette
                      query={commandQuery}
                      commands={DEFAULT_CHAT_COMMANDS}
                      onSelect={handleCommandSelect}
                    />
                  )}
                </AnimatePresence>
              </div>

              <div className="bb-pill__actions">
                <button
                  className="bb-pill__attach"
                  aria-label="Attach file"
                  type="button"
                  onClick={handlePaperclipClick}
                >
                  <Paperclip size={18} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {voice.isSupported && (
                    <button
                      onClick={voice.toggleListening}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: voice.isListening
                          ? 'var(--bb-red, #EF4444)'
                          : 'var(--text-muted, rgba(255,255,255,0.35))',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 150ms',
                      }}
                      aria-label={voice.isListening ? 'Stop listening' : 'Start voice input'}
                      type="button"
                    >
                      {voice.isListening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}
                  <button
                    className="bb-pill__send"
                    onClick={handleSubmit}
                    aria-label="Send"
                    disabled={!canSend || fileUpload.isUploading}
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                ref={inputRef}
                className="bb-pill__input"
                type="text"
                placeholder="Ask BitBit…"
                value={textValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setTextValue(val);
                  if (val.startsWith('/') && val.length > 1) {
                    setShowCommands(true);
                    setCommandQuery(val.slice(1));
                  } else {
                    setShowCommands(false);
                    setCommandQuery('');
                  }
                }}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
              />

              {/* Command palette - appears above the input */}
              <AnimatePresence>
                {showCommands && (
                  <CommandPalette
                    query={commandQuery}
                    commands={DEFAULT_CHAT_COMMANDS}
                    onSelect={handleCommandSelect}
                  />
                )}
              </AnimatePresence>

              <button
                className="bb-pill__send"
                onClick={handleSubmit}
                aria-label="Send"
                disabled={!textValue.trim()}
              >
                <ArrowUp size={14} />
              </button>
            </div>
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

// ---------------------------------------------------------------------------
// Upload progress indicator (inline component)
// ---------------------------------------------------------------------------

function UploadProgressItem({ item, onRemove }: { item: UploadItem; onRemove: () => void }) {
  const isError = item.status === 'error';
  const isActive = item.status === 'uploading' || item.status === 'pending';
  const isImage = !!item.previewUrl;

  const THUMB = 64;

  return (
    <div style={{
      position: 'relative',
      width: `${THUMB}px`,
      flexShrink: 0,
    }}>
      {/* Thumbnail area */}
      <div style={{
        position: 'relative',
        width: `${THUMB}px`,
        height: `${THUMB}px`,
        borderRadius: '8px',
        overflow: 'hidden',
        background: isError
          ? 'rgba(239,68,68,0.15)'
          : 'rgba(255,255,255,0.06)',
        border: isError
          ? '1px solid rgba(239,68,68,0.3)'
          : '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Image thumbnail or file icon */}
        {isImage ? (
          <img
            src={item.previewUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--bb-color-text-secondary, rgba(255,255,255,0.5))',
          }}>
            <FileText size={24} />
          </div>
        )}

        {/* Uploading overlay: darkened + spinner */}
        {isActive && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Loader2
              size={20}
              style={{
                color: 'var(--bb-color-accent, #3b82f6)',
                animation: 'bb-upload-spin 1s linear infinite',
              }}
            />
          </div>
        )}

        {/* Progress bar at bottom of thumbnail */}
        {isActive && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: `${item.progress}%`,
              height: '100%',
              background: 'var(--bb-color-accent, #3b82f6)',
              transition: 'width 200ms ease',
              borderRadius: '0 1px 0 0',
            }} />
          </div>
        )}

        {/* Remove button overlay */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.filename}`}
          style={{
            position: 'absolute',
            top: '3px',
            right: '3px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={10} />
        </button>
      </div>

      {/* Filename below thumbnail for non-image files */}
      {!isImage && (
        <div style={{
          marginTop: '3px',
          fontSize: '10px',
          lineHeight: '13px',
          color: isError
            ? 'var(--bb-color-error, #ef4444)'
            : 'var(--bb-color-text-secondary, rgba(255,255,255,0.5))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          maxWidth: `${THUMB}px`,
        }}>
          {item.filename}
        </div>
      )}

      {/* Error tooltip for images */}
      {isError && isImage && item.error && (
        <div style={{
          marginTop: '3px',
          fontSize: '10px',
          lineHeight: '13px',
          color: 'var(--bb-color-error, #ef4444)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          maxWidth: `${THUMB}px`,
        }}>
          {item.error}
        </div>
      )}

    </div>
  );
}
