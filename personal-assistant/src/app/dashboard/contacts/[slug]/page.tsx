import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Mail, Phone, Tag, Clock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { Contact, Task, ActivityEntry } from '@/lib/types'

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-muted-foreground">Supabase not configured</p>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase!.auth.getUser()
  if (!user) redirect('/login')

  const { data: contact } = await supabase!
    .from('contacts')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-muted-foreground">Contact not found</p>
        <Link
          href="/dashboard/contacts"
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-3" />
          Back to contacts
        </Link>
      </div>
    )
  }

  const profile = contact as Contact
  const tags: string[] = (profile.profile_data as Record<string, unknown>)?.tags as string[] ?? []
  const notes = ((profile.profile_data as Record<string, unknown>)?.notes as string) ?? ''
  const communicationStyle = ((profile.communication_patterns as Record<string, unknown>)?.style as string) ?? ''

  // Fetch related tasks (search by contact name in task title/description)
  const { data: relatedTasks } = await supabase!
    .from('tasks')
    .select('id, title, status')
    .or(`title.ilike.%${profile.name}%,description.ilike.%${profile.name}%`)
    .limit(10)

  // Fetch recent activity mentioning this contact
  const { data: recentActivity } = await supabase!
    .from('activity_feed')
    .select('id, action, created_at')
    .ilike('action', `%${profile.name}%`)
    .order('created_at', { ascending: false })
    .limit(10)

  const typeColor: Record<string, string> = {
    client: 'bg-blue-500/20 text-blue-400',
    partner: 'bg-purple-500/20 text-purple-400',
    lead: 'bg-yellow-500/20 text-yellow-400',
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Link
        href="/dashboard/contacts"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Back to contacts
      </Link>

      <div className="flex items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-xl font-medium text-primary">
          {profile.name.charAt(0)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-medium">{profile.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-sm font-medium ${typeColor[profile.type] || 'bg-muted text-muted-foreground'}`}
            >
              {profile.type}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {profile.emails.map((e: string) => (
              <span key={e} className="flex items-center gap-1">
                <Mail className="size-3" /> {e}
              </span>
            ))}
            {profile.phones.map((p: string) => (
              <span key={p} className="flex items-center gap-1">
                <Phone className="size-3" /> {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {notes && (
              <div>
                <span className="text-muted-foreground">Notes</span>
                <p className="mt-1">{notes}</p>
              </div>
            )}
            {communicationStyle && (
              <div>
                <span className="text-muted-foreground">Communication Style</span>
                <p className="mt-1">{communicationStyle}</p>
              </div>
            )}
            {profile.aliases.length > 0 && (
              <div>
                <span className="text-muted-foreground">Aliases</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profile.aliases.map((a: string) => (
                    <Badge key={a} variant="secondary" className="text-sm">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {tags.length > 0 && (
              <div>
                <span className="text-muted-foreground">Tags</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tags.map((t: string) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-sm"
                    >
                      <Tag className="size-2.5" /> {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Related Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {relatedTasks && relatedTasks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {relatedTasks.map((task: { id: string; title: string; status: string }) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                  >
                    <CheckCircle2
                      className={`size-4 ${
                        task.status === 'completed'
                          ? 'text-green-400'
                          : task.status === 'in-progress'
                            ? 'text-primary'
                            : 'text-muted-foreground'
                      }`}
                    />
                    <span className="flex-1">{task.title}</span>
                    <Badge variant="secondary" className="text-sm">
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No related tasks.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity && recentActivity.length > 0 ? (
              <div className="flex flex-col gap-2">
                {recentActivity.map((act: { id: string; action: string; created_at: string }) => (
                  <div
                    key={act.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span className="flex-1">{act.action}</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(act.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
