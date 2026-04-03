'use client'

import React, { useState, useEffect } from 'react'
import { IconCopy, IconCheck, IconLayoutSidebarRight } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface CodeBlockProps {
  children: string
  className?: string
  onOpenArtifact?: (content: string, lang: string) => void
}

export function CodeBlock({ children, className, onOpenArtifact }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [language, setLanguage] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const codeContent = String(children).replace(/\n$/, '')
  const lineCount = codeContent.split('\n').length

  // Extract language from className (e.g., "language-typescript" -> "typescript")
  useEffect(() => {
    const match = className?.match(/language-(\w+)/)
    const lang = match?.[1] || ''
    setLanguage(lang)
  }, [className])

  // Lazy load shiki and highlight code
  useEffect(() => {
    const highlightCode = async () => {
      try {
        if (!language) {
          setIsLoading(false)
          return
        }

        const { codeToHtml } = await import('shiki')
        const html = await codeToHtml(codeContent, {
          lang: language,
          theme: 'github-dark-default',
        })
        setHighlighted(html)
      } catch (error) {
        console.warn(`Failed to highlight code for language "${language}":`, error)
      } finally {
        setIsLoading(false)
      }
    }

    highlightCode()
  }, [codeContent, language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const showArtifactButton = onOpenArtifact && lineCount > 20

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-card my-3">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/50 border-b border-border min-h-[40px]">
        {/* Language badge (left) */}
        <Badge variant="outline" className="text-[11px] uppercase tracking-wider font-medium">
          {language || 'code'}
        </Badge>

        {/* Controls (right) */}
        <div className="flex gap-1.5 items-center">
          {showArtifactButton && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onOpenArtifact(codeContent, language)}
            >
              <IconLayoutSidebarRight size={14} />
              Panel
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-xs ${copied ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={handleCopy}
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* Code */}
      <div className="max-h-[400px] overflow-auto text-[13px] leading-5 font-mono text-foreground">
        {isLoading || !highlighted ? (
          // Fallback plain monospace
          <pre className="m-0 p-3.5 bg-transparent">
            <code>{codeContent}</code>
          </pre>
        ) : (
          // Shiki highlighted output
          <div
            className="bb-shiki-output p-3.5"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}
      </div>
    </div>
  )
}
