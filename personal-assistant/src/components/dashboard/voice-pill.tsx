'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  IconArrowUp,
  IconFileText,
  IconLoader2,
  IconX,
} from '@tabler/icons-react';
import { ArrowUp, Mic, Plus } from 'lucide-react';
import { MiniWaveform } from '../ui/mini-waveform';
import { Loader } from '@/components/ui/loader';
import { useFileUpload, type UploadItem } from '@/hooks/use-file-upload';
import { useVoiceInput } from '../chat/use-voice-input';
import { CommandPalette, DEFAULT_CHAT_COMMANDS, type ChatCommand } from '../chat/command-palette';
// prompt-kit PromptInput available but using native textarea for docked mode
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  voiceModeEnabled?: boolean;
  onVoiceModeToggle?: () => void;
  isSpeaking?: boolean;
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

  // Voice input hook — auto-submit on final recognition result
  const pendingVoiceSubmitRef = useRef(false);
  const [voiceAutoSending, setVoiceAutoSending] = useState(false);
  const voice = useVoiceInput((text) => {
    setTextValue(text);
    pendingVoiceSubmitRef.current = true;
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

  // Auto-submit after voice recognition delivers final text
  useEffect(() => {
    if (pendingVoiceSubmitRef.current && textValue.trim() && !voice.isListening) {
      pendingVoiceSubmitRef.current = false;
      setVoiceAutoSending(true);
      const timer = setTimeout(() => {
        // Only submit if user hasn't started typing (cancel-on-type)
        if (pendingVoiceSubmitRef.current === false) {
          onTextSubmit(textValue.trim());
          setTextValue('');
        }
        setVoiceAutoSending(false);
      }, 600);
      return () => {
        clearTimeout(timer);
        setVoiceAutoSending(false);
      };
    }
  }, [textValue, voice.isListening, onTextSubmit]);

  // Cancel voice auto-submit when user starts typing manually
  const handleTextChange = useCallback((val: string) => {
    setTextValue(val);
    if (voiceAutoSending) {
      pendingVoiceSubmitRef.current = true; // Prevent the pending submit
      setVoiceAutoSending(false);
    }
  }, [voiceAutoSending]);

  // Auto-dismiss voice error after 3 seconds so the pill doesn't get stuck
  // showing a stale "Microphone access denied" message.
  useEffect(() => {
    if (!voice.error) return;
    const timer = setTimeout(() => voice.clearError(), 3000);
    return () => clearTimeout(timer);
  }, [voice.error, voice.clearError]);

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
    const shouldExpand = textValue.trim() !== '' && textarea.scrollHeight > (twoLineThreshold + 8);
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

  // Build CSS custom properties for morph animations
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
      data-voice-pill
      className={cn(
        // ── Base floating pill ──
        !docked && [
          'fixed bottom-4 left-1/2 z-50',
          'flex items-center gap-0.5',
          'h-[34px] px-3 rounded-[var(--radius-container)]',
          'bg-card border border-border',
          'shadow-md',
          'will-change-[transform,opacity] overflow-visible',
          // Hidden by default (floating only)
          'opacity-0 invisible pointer-events-none',
          '-translate-x-1/2 translate-y-full',
          'transition-[width,height] duration-[180ms] ease-[cubic-bezier(0.25,1,0.5,1)]',
        ],

        // ── Docked (inside chat) ──
        docked && [
          'relative z-auto',
          'flex flex-col items-stretch',
          'w-full max-w-[860px] mx-auto',
          'rounded-[24px] border border-border bg-card',
          'shadow-xs',
          'opacity-100 visible pointer-events-auto',
          'transition-[min-height,padding] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        ],
        docked && compactDocked && !isDockedExpanded && 'p-0 pt-1',
        docked && (!compactDocked || isDockedExpanded) && 'p-0 pt-1',

        // ── Floating visible ──
        !docked && isVisible && !isExiting && [
          'opacity-100 visible pointer-events-auto',
          '-translate-x-1/2 translate-y-0',
          'animate-[pill-enter_220ms_cubic-bezier(0.34,1.56,0.64,1)_both]',
        ],

        // ── Docked visible ──
        docked && isVisible && !isExiting && [
          'animate-[pill-dock-enter_250ms_cubic-bezier(0.34,1.56,0.64,1)_both]',
        ],

        // ── Chat-anchored floating ──
        !docked && floatingAnchor && [
          'left-[var(--bb-pill-anchor-left,50%)]',
          'top-[var(--bb-pill-anchor-top,50%)]',
          'bottom-auto',
          '-translate-x-1/2 -translate-y-[calc(50%-14px)]',
        ],
        !docked && floatingAnchor && isVisible && !isExiting && [
          '-translate-x-1/2 -translate-y-1/2',
          'animate-[pill-chat-anchor-enter_170ms_cubic-bezier(0.22,1,0.36,1)_both]',
        ],

        // ── Morph phases ──
        !docked && morphPhase === 'to-floating' && [
          'animate-[pill-morph-to-floating_120ms_cubic-bezier(0.22,1,0.36,1)_both]',
        ],
        docked && morphPhase === 'to-docked' && isVisible && [
          'animate-[pill-morph-to-docked_110ms_cubic-bezier(0.22,1,0.36,1)_both]',
        ],
        !docked && morphing && [
          'animate-[pill-snap-morph_220ms_cubic-bezier(0.2,1,0.2,1)_both]',
        ],

        // ── Exit ──
        isExiting && !docked && 'pointer-events-none animate-[pill-exit_200ms_cubic-bezier(0.4,0,1,1)_both]',
        isExiting && !docked && floatingAnchor && 'animate-[pill-chat-anchor-exit_170ms_cubic-bezier(0.4,0,1,1)_both]',

        // ── Mode-specific sizes (floating only) ──
        !docked && effectiveMode === 'voice' && 'w-[160px]',
        !docked && effectiveMode === 'text' && 'w-[360px]',
        !docked && effectiveMode === 'processing' && 'w-[100px] justify-center',
        !docked && effectiveMode === 'response' && [
          'w-[280px] h-auto max-h-[180px]',
          'flex-col items-start',
          'px-3 py-2 gap-[3px] rounded-lg',
        ],
      )}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="BitBit AI"
      style={pillStyle}
      aria-hidden={!isVisible}
    >
      {/* ── Voice waveform ── */}
      {effectiveMode === 'voice' && (
        <MiniWaveform
          frequencyData={frequencyData}
          barCount={24}
          isActive={true}
        />
      )}

      {/* ── Processing indicator ── */}
      {effectiveMode === 'processing' && (
        <div className="flex flex-1 items-center justify-center">
          <Loader variant="pulse-dot" size="sm" />
        </div>
      )}

      {/* ── Text input mode ── */}
      {effectiveMode === 'text' && (
        <>
          {/* Hidden file input for Paperclip button */}
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-hidden="true"
          />

          {docked ? (
            <>
              {/* Upload progress indicators */}
              {hasUploads && (
                <div className="flex flex-row flex-wrap gap-2 px-1 pt-1 w-full">
                  {fileUpload.uploads.map((item) => (
                    <UploadProgressItem
                      key={item.id}
                      item={item}
                      onRemove={() => fileUpload.removeUpload(item.id)}
                    />
                  ))}
                </div>
              )}

              {/* Live transcript preview */}
              <AnimatePresence>
                {voice.isListening && voice.transcript && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="mx-4 mb-1 px-3 py-1.5 rounded-lg bg-muted/50 text-sm text-muted-foreground italic"
                  >
                    &ldquo;{voice.transcript}&rdquo;
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Voice error notice (mic permission denied, etc.) */}
              <AnimatePresence>
                {voice.error && (
                  <motion.div
                    key="voice-error"
                    role="alert"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="mx-4 mb-1 px-3 py-1.5 rounded-lg bg-destructive/10 text-sm text-destructive"
                    data-testid="voice-error"
                  >
                    {voice.error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Command palette container */}
              <div className="relative w-full">
                <textarea
                  ref={textareaRef}
                  className={cn(
                    'w-full flex-1 resize-none overflow-y-auto',
                    'bg-transparent border-0 outline-none shadow-none',
                    'text-base leading-[1.3] text-foreground',
                    'placeholder:text-muted-foreground',
                    'focus-visible:ring-0 focus-visible:border-0',
                    'max-h-[188px] pt-3 pl-4',
                    'min-h-[44px]',
                  )}
                  placeholder="Message BitBit..."
                  value={textValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleTextChange(val);
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

              {/* Action buttons row */}
              <div className="mt-5 flex w-full items-center justify-between gap-2 px-3 pb-3">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9 rounded-full"
                    onClick={handlePaperclipClick}
                    type="button"
                    aria-label="Attach file"
                  >
                    <Plus size={18} />
                  </Button>

                  {voice.isSupported && (
                    <AnimatePresence mode="wait">
                      {voice.isListening ? (
                        <motion.button
                          key="waveform"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          onClick={voice.toggleListening}
                          type="button"
                          aria-label="Stop listening"
                          className={cn(
                            'flex items-center gap-1 h-9 px-2 rounded-full',
                            'border border-destructive/30 bg-destructive/10',
                            'transition-colors cursor-pointer',
                          )}
                        >
                          <span className="relative flex size-2.5">
                            <span className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-50" />
                            <span className="relative rounded-full size-2.5 bg-destructive" />
                          </span>
                          <MiniWaveform
                            frequencyData={voice.frequencyData}
                            barCount={16}
                            isActive={voice.isListening}
                          />
                        </motion.button>
                      ) : (
                        <motion.div
                          key="mic"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-9 rounded-full"
                            onClick={voice.toggleListening}
                            type="button"
                            aria-label="Voice input"
                          >
                            <Mic size={18} />
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <AnimatePresence>
                    {voiceAutoSending && (
                      <motion.span
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        className="text-xs text-muted-foreground mr-1"
                      >
                        Sending...
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <Button
                    size="icon"
                    disabled={!canSend || fileUpload.isUploading}
                    onClick={handleSubmit}
                    className="size-9 rounded-full"
                    aria-label="Send"
                  >
                    <ArrowUp size={18} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* ── Floating text input ── */
            <div className="relative w-full flex items-center">
              <input
                ref={inputRef}
                className={cn(
                  'flex-1 min-w-0',
                  'bg-transparent border-0 outline-none',
                  'text-sm text-foreground caret-foreground',
                  'placeholder:text-muted-foreground',
                )}
                type="text"
                placeholder="Ask BitBit\u2026"
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

              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={handleSubmit}
                aria-label="Send"
                disabled={!textValue.trim()}
              >
                <IconArrowUp size={14} />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Response mode ── */}
      {effectiveMode === 'response' && (
        <div className="flex flex-col gap-[3px] overflow-y-auto max-h-[140px] w-full animate-[pill-content-enter_180ms_cubic-bezier(0.25,1,0.5,1)_both]">
          {error ? (
            <span className="text-sm leading-[1.4] text-destructive">{error}</span>
          ) : (
            <>
              {transcription && (
                <p className="text-sm leading-[1.3] text-muted-foreground italic">&ldquo;{transcription}&rdquo;</p>
              )}
              <p className="text-sm leading-[1.4] text-foreground">{response}</p>
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

  return (
    <div className="relative w-16 shrink-0">
      {/* Thumbnail area */}
      <div className={cn(
        'relative size-16 rounded-lg overflow-hidden',
        isError
          ? 'bg-destructive/15 border border-destructive/30'
          : 'bg-muted border border-border',
      )}>
        {/* Image thumbnail or file icon */}
        {isImage ? (
          <img
            src={item.previewUrl}
            alt=""
            className="size-full object-cover block"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground">
            <IconFileText size={24} />
          </div>
        )}

        {/* Uploading overlay: darkened + spinner */}
        {isActive && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <IconLoader2
              size={20}
              className="text-primary animate-spin"
            />
          </div>
        )}

        {/* Progress bar at bottom of thumbnail */}
        {isActive && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/30">
            <div
              className="h-full bg-primary transition-[width] duration-200 ease-out rounded-tr-sm"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        {/* Remove button overlay */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.filename}`}
          className={cn(
            'absolute top-[3px] right-[3px]',
            'size-[18px] rounded-full',
            'bg-black/60',
            'border-0 p-0 cursor-pointer',
            'text-primary-foreground',
            'flex items-center justify-center',
          )}
        >
          <IconX size={10} />
        </button>
      </div>

      {/* Filename below thumbnail for non-image files */}
      {!isImage && (
        <div className={cn(
          'mt-1 text-sm leading-[13px]',
          'overflow-hidden text-ellipsis whitespace-nowrap text-center',
          'max-w-16',
          isError ? 'text-destructive' : 'text-muted-foreground',
        )}>
          {item.filename}
        </div>
      )}

      {/* Error tooltip for images */}
      {isError && isImage && item.error && (
        <div className="mt-1 text-sm leading-[13px] text-destructive overflow-hidden text-ellipsis whitespace-nowrap text-center max-w-16">
          {item.error}
        </div>
      )}
    </div>
  );
}