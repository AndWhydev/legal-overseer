'use client';

import React, { useState, useEffect } from 'react';
import { IconDownload, IconTrash, IconAlertTriangle, IconLoader2, IconCheck, IconX } from '@tabler/icons-react';
import { logger } from '@/lib/core/logger';

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

  return (
    <div className="max-w-[600px]">
      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-4 ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-red-500/10 text-red-500'
          }`}
        >
          {message.type === 'success' ? <IconCheck size={16} /> : <IconX size={16} />}
          {message.text}
        </div>
      )}

      <div className="rounded-xl bg-card backdrop-blur-lg p-6 mb-4">
        <h3 className="text-base font-medium text-foreground mb-3">
          Export Your Data
        </h3>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Download all your data in JSON format, including contacts, tasks, messages, and memories. Limited to 1 export per hour.
        </p>
        <button
          onClick={handleDataExport}
          disabled={exportLoading}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border-none text-sm font-medium cursor-pointer transition-all bg-muted text-foreground hover:bg-accent disabled:opacity-60"
        >
          {exportLoading ? <IconLoader2 size={16} className="animate-spin" /> : <IconDownload size={16} />}
          {exportLoading ? 'Exporting...' : 'Export My Data'}
        </button>
      </div>

      {deletionStatus ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-6 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <IconAlertTriangle size={18} className="text-red-500 shrink-0" />
            <h3 className="text-base font-medium text-red-500">
              Deletion Pending
            </h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            Your account deletion is scheduled. You have until{' '}
            <strong className="text-foreground">
              {new Date(deletionStatus.cancel_until || '').toLocaleDateString()}
            </strong>
            {' '}to cancel this request. After that, all your data will be permanently deleted.
          </p>
          <button
            onClick={handleCancelDeletion}
            disabled={cancelLoading}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border-none text-sm font-medium cursor-pointer transition-all bg-green-500/10 text-green-500 hover:bg-green-500/20 disabled:opacity-60"
          >
            {cancelLoading ? <IconLoader2 size={16} className="animate-spin" /> : <IconCheck size={16} />}
            {cancelLoading ? 'Cancelling...' : 'Cancel Deletion'}
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-card backdrop-blur-lg p-6">
          <h3 className="text-base font-medium text-foreground mb-3">
            Delete Your Account
          </h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Permanently delete your account and all associated data. This action cannot be undone, but you will have 30 days to cancel.
          </p>
          <button
            onClick={() => {
              setDeleteModalOpen(true);
              setDeleteConfirmation('');
            }}
            disabled={deleteLoading}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border-none text-sm font-medium cursor-pointer transition-all bg-red-500/10 text-red-500 hover:bg-red-500/20"
          >
            <IconTrash size={16} />
            Delete Account
          </button>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleteLoading && setDeleteModalOpen(false)}
          />
          <div className="relative p-8 rounded-xl bg-card backdrop-blur-xl border border-border shadow-lg max-w-[420px] w-[90%]">
            <button
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleteLoading}
              className="absolute top-4 right-4 bg-transparent border-none text-muted-foreground cursor-pointer p-1 disabled:opacity-50 disabled:cursor-default"
            >
              <IconX size={18} />
            </button>

            <div className="text-center mb-5">
              <div className="flex justify-center mb-3">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="20" fill="rgba(239, 68, 68, 0.12)" />
                  <path d="M20 9V24M12 28H28" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-base font-medium text-foreground">
                Delete Your Account?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                This will schedule your account for permanent deletion.
              </p>
            </div>

            <div className="mb-5">
              <p className="text-sm text-muted-foreground mb-2 font-medium">
                Type DELETE to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={e => setDeleteConfirmation(e.target.value)}
                placeholder="Type DELETE"
                disabled={deleteLoading}
                className="w-full px-3 py-3 rounded-lg bg-muted border border-border text-foreground text-sm font-mono disabled:opacity-50"
              />
            </div>

            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              You will have 30 days to cancel this request before your data is permanently deleted.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-none text-sm font-medium cursor-pointer transition-all bg-muted text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirmation.toUpperCase() !== 'DELETE'}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-none text-sm font-medium cursor-pointer transition-all bg-red-500/10 text-red-500 disabled:opacity-50"
              >
                {deleteLoading ? <IconLoader2 size={16} className="animate-spin" /> : <IconTrash size={16} />}
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
