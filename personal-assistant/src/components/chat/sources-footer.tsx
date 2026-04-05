'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { IconChevronDown, IconExternalLink } from '@tabler/icons-react'
import type { Citation } from './chat-interface'

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}

function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${extractDomain(url)}&sz=16`
}

export function SourcesFooter({ sources }: { sources: Citation[] }) {
  const [expanded, setExpanded] = useState(false)

  if (!sources || sources.length === 0) return null

  // Deduplicate by URL
  const unique = sources.filter(
    (s, i, arr) => arr.findIndex(x => x.url === s.url) === i
  )

  return (
    <div className="mt-2 max-w-[min(72ch,100%)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{unique.length} source{unique.length !== 1 ? 's' : ''}</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <IconChevronDown size={14} />
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5 pt-2">
              {unique.map((source, i) => (
                <a
                  key={`${source.url}-${i}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <img
                    src={faviconUrl(source.url)}
                    alt=""
                    width={14}
                    height={14}
                    className="shrink-0 rounded-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <span className="min-w-0 truncate text-foreground">
                    {source.title || extractDomain(source.url)}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {extractDomain(source.url)}
                  </span>
                  <IconExternalLink
                    size={12}
                    className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
