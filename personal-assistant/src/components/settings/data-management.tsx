'use client';

import React, { useState, useEffect } from 'react';
import { Download, Trash2, AlertTriangle, Loader2, Check, X } from 'lucide-react';
import { logger } from '@/lib/core/logger';
import { S, C } from '@/lib/styles/design-tokens'

interface DeletionStatus {
  status: string;
  cancel_until?: string;
  pending?: boolean;
}

export function DataManagement() {
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check deletion status on mount
  useEffect(() => {
    checkDeletionStatus();
  }, []);

  const checkDeletionStatus = async () => {
    try {
      const response = await fetch('/api/account/delete');
      if (response.status === 200) {
        const data = await response.json() as DeletionStatus;
        if (data.status === 'deletion_pending') {
          setDeletionStatus(data);
        }
      }
    } catch (err) {
      logger.warn('Could not check deletion status:', err);
    }
  };

  const handleDataExport = async () => {
    try {
      setExportLoading(true);
      setMessage(null);

      const response = await fetch('/api/data-export');
      if (!response.ok) {
        const error = await response.json() as { error: string };
        throw new Error(error.error || 'Export failed');
      }

      // Trigger download
      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') || 'bitbit-export.json';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setMessage({ type: 'success', text: 'Data exported successfully' });
      logger.info('Data export completed');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Export failed';
      setMessage({ type: 'error', text: errorMsg });
      logger.error('Data export error:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation.toUpperCase() !== 'DELETE') {
      setMessage({ type: 'error', text: 'Please type DELETE to confirm' });
      return;
    }

    try {
      setDeleteLoading(true);
      setMessage(null);

      const response = await fetch('/api/account/delete?confirm=DELETE_MY_ACCOUNT', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json() as { error: string };
        throw new Error(error.error || 'Deletion failed');
      }

      const data = await response.json() as DeletionStatus;
      setDeletionStatus(data);
      setDeleteModalOpen(false);
      setDeleteConfirmation('');
      setMessage({ type: 'success', text: 'Account deletion initiated. Check your email.' });
      logger.info('Account deletion initiated');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Deletion failed';
      setMessage({ type: 'error', text: errorMsg });
      logger.error('Account deletion error:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    try {
      setCancelLoading(true);
      setMessage(null);

      const response = await fetch('/api/account/cancel-deletion', {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json() as { error: string };
        throw new Error(error.error || 'Cancellation failed');
      }

      setDeletionStatus(null);
      setMessage({ type: 'success', text: 'Account deletion cancelled. Your account is re-enabled.' });
      logger.info('Account deletion cancelled');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Cancellation failed';
      setMessage({ type: 'error', text: errorMsg });
      logger.error('Cancel deletion error:', err);
    } finally {
      setCancelLoading(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    padding: '24px',
    borderRadius: '12px',
    background: 'var(--glass-pill-bg)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    boxShadow: 'var(--glass-card-inset)',
    border: 'none',
    marginBottom: '16px',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 200ms',
    background: C.bgHoverStrong,
    color: 'var(--text-primary)',
  };

  const dangerButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: C.statusErrorBg,
    color: '#EF4444',
  };

  const messageStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  return (
    <div style={{ maxWidth: '600px' }}>
      {message && (
        <div
          style={{
            ...messageStyle,
            background: message.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : C.statusErrorBg,
            color: message.type === 'success' ? '#22C55E' : '#EF4444',
          }}
        >
          {message.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {message.text}
        </div>
      )}

      <div style={containerStyle}>
        <h3 style={{ fontSize: '16px', fontWeight: '500', margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
          Export Your Data
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.5' }}>
          Download all your data in JSON format, including contacts, tasks, messages, and memories. Limited to 1 export per hour.
        </p>
        <button
          onClick={handleDataExport}
          disabled={exportLoading}
          style={{
            ...buttonStyle,
            opacity: exportLoading ? 0.6 : 1,
          }}
        >
          {exportLoading ? <Loader2 size={16} style={{ animation: 'bb-spin 1s linear infinite' }} /> : <Download size={16} />}
          {exportLoading ? 'Exporting...' : 'Export My Data'}
        </button>
      </div>

      {deletionStatus ? (
        <div style={{ ...containerStyle, borderColor: C.statusError, background: C.statusErrorBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0, color: '#EF4444' }}>
              Deletion Pending
            </h3>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: '1.5' }}>
            Your account deletion is scheduled. You have until{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {new Date(deletionStatus.cancel_until || '').toLocaleDateString()}
            </strong>
            {' '}to cancel this request. After that, all your data will be permanently deleted.
          </p>
          <button
            onClick={handleCancelDeletion}
            disabled={cancelLoading}
            style={{
              ...buttonStyle,
              background: C.statusSuccessBg,
              color: '#22C55E',
              opacity: cancelLoading ? 0.6 : 1,
            }}
          >
            {cancelLoading ? <Loader2 size={16} style={{ animation: 'bb-spin 1s linear infinite' }} /> : <Check size={16} />}
            {cancelLoading ? 'Cancelling...' : 'Cancel Deletion'}
          </button>
        </div>
      ) : (
        <div style={containerStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: '500', margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
            Delete Your Account
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.5' }}>
            Permanently delete your account and all associated data. This action cannot be undone, but you will have 30 days to cancel.
          </p>
          <button
            onClick={() => {
              setDeleteModalOpen(true);
              setDeleteConfirmation('');
            }}
            disabled={deleteLoading}
            style={dangerButtonStyle}
          >
            <Trash2 size={16} />
            Delete Account
          </button>
        </div>
      )}

      {deleteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: C.bgOverlay,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={() => !deleteLoading && setDeleteModalOpen(false)}
          />
          <div
            style={{
              position: 'relative',
              padding: '32px',
              borderRadius: '16px',
              background: 'var(--glass-card-bg)',
              backdropFilter: 'var(--glass-card-blur)',
              WebkitBackdropFilter: 'var(--glass-card-blur)',
              border: '1px solid var(--glass-card-border)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
              maxWidth: '420px',
              width: '90%',
            }}
          >
            <button
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleteLoading}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: deleteLoading ? 'default' : 'pointer',
                padding: '4px',
                opacity: deleteLoading ? 0.5 : 1,
              }}
            >
              <X size={18} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="20" fill="rgba(239, 68, 68, 0.12)" />
                  <path d="M20 9V24M12 28H28" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0, color: 'var(--text-primary)' }}>
                Delete Your Account?
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                This will schedule your account for permanent deletion.
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>
                Type DELETE to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={e => setDeleteConfirmation(e.target.value)}
                placeholder="Type DELETE"
                disabled={deleteLoading}
                style={{
                  width: '100%',
                  padding: '12px 12px',
                  borderRadius: '8px',
                  background: C.bgHover,
                  border: `1px solid ${C.borderHover}`,
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  opacity: deleteLoading ? 0.5 : 1,
                }}
              />
            </div>

            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
              You will have 30 days to cancel this request before your data is permanently deleted.
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteLoading}
                style={{
                  flex: 1,
                  ...buttonStyle,
                  opacity: deleteLoading ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirmation.toUpperCase() !== 'DELETE'}
                style={{
                  flex: 1,
                  ...dangerButtonStyle,
                  opacity: deleteLoading || deleteConfirmation.toUpperCase() !== 'DELETE' ? 0.5 : 1,
                }}
              >
                {deleteLoading ? <Loader2 size={16} style={{ animation: 'bb-spin 1s linear infinite' }} /> : <Trash2 size={16} />}
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
