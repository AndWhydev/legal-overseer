import { useState, useCallback } from 'react'

export interface Artifact {
  id: string
  type: 'code' | 'html' | 'markdown'
  title: string
  content: string
  language?: string
  messageId: string
}

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)

  const addArtifact = useCallback((artifact: Artifact) => {
    setArtifacts(prev => {
      const exists = prev.find(a => a.id === artifact.id)
      if (exists) return prev
      return [...prev, artifact]
    })
    setActiveArtifactId(artifact.id)
  }, [])

  const closeArtifact = useCallback(() => {
    setActiveArtifactId(null)
  }, [])

  const activeArtifact = artifacts.find(a => a.id === activeArtifactId) ?? null

  return { artifacts, activeArtifact, addArtifact, closeArtifact, setActiveArtifactId }
}
