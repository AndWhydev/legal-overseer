'use client'

import React, { useState, useEffect } from 'react'
import { IconCopy, IconCheck, IconLoader2, IconTrash, IconPlus, IconEye, IconEyeOff } from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { logger } from '@/lib/core/logger'

interface ApiKey {
  id: string
  name: string
  displayKey: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
  isRevoked: boolean
}

interface NewKeyResponse {
  id: string
  name: string
  key: string
  displayKey: string
  scopes: string[]
  createdAt: string
  warning: string
}

export function ApiKeyManagement() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewKey, setShowNewKey] = useState(false)
  const [newKeyForm, setNewKeyForm] = useState({ name: '' })
  const [newKeyDisplay, setNewKeyDisplay] = useState<NewKeyResponse | null>(null)
  const [copyState, setCopyState] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)

  // Fetch keys on mount
  useEffect(() => {
    const fetchKeys = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/keys')
        const data = await res.json()
        setKeys(data.keys || [])
      } catch (err) {
        logger.error('Failed to fetch API keys:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchKeys()
  }, [])

  const handleGenerateKey = async () => {
    if (!newKeyForm.name.trim()) {
      logger.warn('Key name is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyForm.name }),
      })

      if (!res.ok) {
        const error = await res.json()
        logger.error('Failed to create key:', error)
        return
      }

      const data: NewKeyResponse = await res.json()
      setNewKeyDisplay(data)
      setKeys([
        {
          id: data.id,
          name: data.name,
          displayKey: data.displayKey,
          scopes: data.scopes,
          lastUsedAt: null,
          createdAt: data.createdAt,
          isRevoked: false,
        },
        ...keys,
      ])
      setNewKeyForm({ name: '' })
      setShowNewKey(false)
    } catch (err) {
      logger.error('Failed to generate key:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeKey = async (keyId: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      })

      if (!res.ok) {
        logger.error('Failed to revoke key')
        return
      }

      setKeys(keys.map((k) => (k.id === keyId ? { ...k, isRevoked: true } : k)))
      setRevokeConfirm(null)
    } catch (err) {
      logger.error('Failed to revoke key:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopyState(true)
    setTimeout(() => setCopyState(false), 1500)
  }

  return (
    <div className="space-y-6 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-medium text-foreground">API Keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage API keys for partner integrations and automations</p>
        </div>
        {!showNewKey && (
          <Button onClick={() => setShowNewKey(true)}>
            <IconPlus className="size-4" />
            Generate Key
          </Button>
        )}
      </div>

      {/* New Key Form */}
      {showNewKey && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Generate New API Key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                type="text"
                placeholder="e.g., Production API Key"
                value={newKeyForm.name}
                onChange={(e) => setNewKeyForm({ name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use a descriptive name to identify where this key is used
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleGenerateKey}
                disabled={loading || !newKeyForm.name.trim()}
              >
                {loading ? (
                  <>
                    <IconLoader2 className="size-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Create Key'
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowNewKey(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Key Display */}
      {newKeyDisplay && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-sm">Your API Key</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setNewKeyDisplay(null)}>
                Dismiss
              </Button>
            </div>
            <CardDescription>{newKeyDisplay.warning}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-sm break-all">
              <span className="flex-1 text-foreground">{newKeyDisplay.key}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => handleCopyKey(newKeyDisplay.key)}
                title="Copy to clipboard"
              >
                {copyState ? (
                  <IconCheck className="size-3.5 text-emerald-500" />
                ) : (
                  <IconCopy className="size-3.5" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Active Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No API keys yet. Generate one to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{key.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">Key: {key.displayKey}</span>
                      {key.lastUsedAt && <span>Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                      <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                      {key.isRevoked && (
                        <Badge variant="destructive" className="text-[10px]">Revoked</Badge>
                      )}
                    </div>
                  </div>
                  {!key.isRevoked && (
                    <div className="flex gap-2">
                      {revokeConfirm === key.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRevokeKey(key.id)}
                            disabled={loading}
                          >
                            {loading ? 'Revoking...' : 'Confirm Revoke'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRevokeConfirm(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setRevokeConfirm(key.id)}
                        >
                          <IconTrash className="size-3" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
