'use client'

import React, { useState, useEffect } from 'react'
import { Copy, Check, PanelRightOpen } from 'lucide-react'

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
    <div
      style={{
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'var(--glass-bg-heavy, rgba(13, 17, 23, 0.8))',
        border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
        marginBlock: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
          minHeight: '40px',
        }}
      >
        {/* Language badge (left) */}
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-muted, rgba(255, 255, 255, 0.4))',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {language || 'code'}
        </span>

        {/* Controls (right) */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {showArtifactButton && (
            <button
              onClick={() => onOpenArtifact(codeContent, language)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                padding: '6px 8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted, rgba(255, 255, 255, 0.4))',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary, #F1F5F9)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted, rgba(255, 255, 255, 0.4))'
              }}
            >
              <PanelRightOpen size={14} />
              Panel
            </button>
          )}

          <button
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              padding: '6px 8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: copied ? 'var(--bb-green, #22C55E)' : 'var(--text-muted, rgba(255, 255, 255, 0.4))',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => {
              if (!copied) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary, #F1F5F9)'
              }
            }}
            onMouseLeave={e => {
              if (!copied) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted, rgba(255, 255, 255, 0.4))'
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Code */}
      <div
        style={{
          maxHeight: '400px',
          overflowY: 'auto',
          overflowX: 'auto',
          fontSize: '13px',
          lineHeight: '20px',
          fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Consolas, monospace',
          color: 'var(--text-primary, #F1F5F9)',
        }}
      >
        {isLoading || !highlighted ? (
          // Fallback plain monospace
          <pre
            style={{
              margin: 0,
              padding: '14px',
              backgroundColor: 'transparent',
            }}
          >
            <code>{codeContent}</code>
          </pre>
        ) : (
          // Shiki highlighted output
          <div
            className="bb-shiki-output"
            style={{ padding: '14px' }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}
      </div>
    </div>
  )
}
