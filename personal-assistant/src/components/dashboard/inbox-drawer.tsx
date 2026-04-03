// src/components/dashboard/inbox-drawer.tsx
'use client'

import { useEffect } from 'react'
import { InboxDrawerIdentity } from './inbox-drawer-identity'
import { InboxDrawerTriage } from './inbox-drawer-triage'
import { EmailThreadView } from './inbox-drawer-email-thread'
import { ChatThreadView } from './inbox-drawer-chat-thread'
import { EmailComposer } from './inbox-drawer-email-composer'
import { ChatComposer } from './inbox-drawer-chat-composer'
import { InboxDrawerActions } from './inbox-drawer-actions'
import {
  useDrawerState,
  type InboxMessage,
  type ThreadMessageItem,
} from './use-drawer-state'

// Re-export types for consumers
export type { InboxMessage, ThreadMessageItem }

export interface InboxDrawerProps {
  message: InboxMessage
  onClose: () => void
  onArchive: (id: string) => void
  onDone: (id: string) => void
  onReply: (id: string, body: string) => void
  onNavigate: (direction: 'prev' | 'next') => void
  threadMessages?: ThreadMessageItem[]
}

export default function InboxDrawer({
  message,
  onClose,
  onArchive,
  onDone,
  onReply,
  onNavigate,
  threadMessages = [],
}: InboxDrawerProps) {
  const state = useDrawerState(message, threadMessages, {
    onClose,
    onArchive,
    onDone,
    onReply,
    onNavigate,
  })

  const senderName = message.contactName || message.senderName || message.senderEmail || 'Unknown'
  const isNotification = state.channelFamily === 'notification'

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      if (tag === 'TEXTAREA' && e.key !== 'Escape' && !(e.metaKey || e.ctrlKey)) return

      switch (e.key) {
        case 'Escape': e.preventDefault(); state.close(); break
        case 'j': e.preventDefault(); state.navigate('next'); break
        case 'k': e.preventDefault(); state.navigate('prev'); break
        case 'r': e.preventDefault(); state.setReplyMode('reply'); break
        case 'a': if (state.channelFamily === 'email') { e.preventDefault(); state.setReplyMode('reply-all') } break
        case 'f': e.preventDefault(); state.setReplyMode('forward'); break
        case 'd': e.preventDefault(); state.markDone(); break
        case 'e': e.preventDefault(); state.archive(); break
        case '!': e.preventDefault(); state.markSpam(); break
        case 'b': e.preventDefault(); state.delegateToBitBit(); break
        case 'Enter':
          if ((e.metaKey || e.ctrlKey) && tag === 'TEXTAREA') {
            e.preventDefault()
            state.sendReply()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state])

  return (
    <>
      {/* Zone 1: Identity */}
      <InboxDrawerIdentity
        message={message}
        channelFamily={state.channelFamily}
        onClose={state.close}
      />

      {/* Zone 2: AI Triage */}
      <InboxDrawerTriage
        summary={state.triageSummary}
        triageState={state.triageState}
        delegationActions={state.delegationActions}
        compact={state.channelFamily === 'chat'}
        onDelegate={state.delegateToBitBit}
        onUndoDelegate={state.undoDelegation}

      />

      {/* Zone 3: Thread (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {state.channelFamily === 'email' ? (
          <EmailThreadView messages={threadMessages} />
        ) : (
          <ChatThreadView messages={threadMessages} channelType={message.channelType} />
        )}
      </div>

      {/* Zone 4: Composer (skip for notifications) */}
      {!isNotification && (
        state.channelFamily === 'email' ? (
          <EmailComposer
            recipientName={senderName}
            recipientEmail={message.senderEmail}
            replyMode={state.replyMode}
            draftText={state.draftText}
            attachments={state.attachments}
            ccRecipients={state.ccRecipients}
            bccRecipients={state.bccRecipients}
            isComposerFocused={state.isComposerFocused}
            onDraftChange={state.setDraftText}
            onAddAttachment={state.addAttachment}
            onRemoveAttachment={state.removeAttachment}
            onCcChange={state.setCc}
            onBccChange={state.setBcc}
            onFocusChange={state.setComposerFocused}
            onSend={state.sendReply}
          />
        ) : (
          <ChatComposer
            recipientName={senderName}
            draftText={state.draftText}
            onDraftChange={state.setDraftText}
            onAddAttachment={state.addAttachment}
            onSend={state.sendReply}
            onFocusChange={state.setComposerFocused}
          />
        )
      )}

      {/* Zone 5: Actions */}
      {!isNotification && (
        <InboxDrawerActions
          channelFamily={state.channelFamily}
          onArchive={state.archive}
          onForward={() => state.setReplyMode('forward')}
          onSpam={state.markSpam}
        />
      )}
    </>
  )
}
