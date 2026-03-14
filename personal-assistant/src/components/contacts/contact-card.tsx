import Link from 'next/link'
import { SFEnvelope, SFPhone, SFTag } from 'sf-symbols-lib'
import { Card, CardContent } from '@/components/ui/card'
import type { Contact } from '@/lib/types'

const typeColor: Record<string, string> = {
  client: 'bg-blue-500/20 text-blue-400',
  partner: 'bg-purple-500/20 text-purple-400',
  lead: 'bg-yellow-500/20 text-yellow-400',
}

export function ContactCard({ contact }: { contact: Contact }) {
  const tags: string[] = (contact.profile_data as Record<string, unknown>)?.tags as string[] ?? []

  return (
    <Link href={`/dashboard/contacts/${contact.slug}`}>
      <Card className="border-border/50 transition-colors hover:border-border hover:bg-card/80">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {contact.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{contact.name}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColor[contact.type] || 'bg-muted text-muted-foreground'}`}
                >
                  {contact.type}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {contact.emails[0] && (
                  <span className="flex items-center gap-1 truncate">
                    <SFEnvelope className="size-3" />
                    {contact.emails[0]}
                  </span>
                )}
                {contact.phones[0] && (
                  <span className="flex items-center gap-1">
                    <SFPhone className="size-3" />
                    {contact.phones[0]}
                  </span>
                )}
              </div>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  <SFTag className="size-2" />
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
