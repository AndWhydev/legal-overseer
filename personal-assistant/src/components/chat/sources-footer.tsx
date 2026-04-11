'use client'

import { motion } from 'motion/react'
import { IconExternalLink } from '@tabler/icons-react'
import type { Citation } from './types'

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}

function faviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${extractDomain(url)}&sz=32`
}

export function SourcesFooter({ sources }: { sources: Citation[] }) {
  if (!sources || sources.length === 0) return null

  // Deduplicate by URL
  const unique = sources.filter(
    (s, i, arr) => arr.findIndex(x => x.url === s.url) === i
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 }}
      className="mt-3 max-w-[min(72ch,100%)]"
    >
      <p className="text-xs text-muted-foreground mb-2 font-medium">
        Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {unique.map((source, i) => (
          <a
            key={`${source.url}-${i}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm transition-all hover:border-foreground/20 hover:shadow-sm min-w-0 max-w-[260px]"
          >
            <img
              src={faviconUrl(source.url)}
              alt=""
              width={16}
              height={16}
              className="shrink-0 rounded-sm"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-foreground text-[13px] font-medium leading-tight">
                {source.title || extractDomain(source.url)}
              </p>
              <p className="truncate text-muted-foreground text-xs leading-tight">
                {extractDomain(source.url)}
              </p>
            </div>
            <IconExternalLink
              size={12}
              className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </a>
        ))}
      </div>
    </motion.div>
  )
}
