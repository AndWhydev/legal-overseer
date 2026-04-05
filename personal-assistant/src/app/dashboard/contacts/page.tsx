import { redirect } from 'next/navigation'
import { ContactCard } from '@/components/contacts/contact-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Search } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { Contact } from '@/lib/types'

type ContactsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  let contacts: Contact[] = []
  const params = (await searchParams) ?? {}
  const queryValue = params.q
  const query = (Array.isArray(queryValue) ? queryValue[0] : queryValue ?? '').trim()

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase!.auth.getUser()

      if (user) {
        const profileLookup = await supabase!
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .single()

        if (profileLookup.data?.org_id) {
          let dbQuery = supabase!.from('contacts').select('*').eq('org_id', profileLookup.data.org_id)

          if (query) {
            const escapedQuery = query.replace(/[%_]/g, '')
            dbQuery = dbQuery.or(
              `name.ilike.%${escapedQuery}%,slug.ilike.%${escapedQuery}%,type.ilike.%${escapedQuery}%`
            )
          }

          const { data } = await dbQuery.order('name')
          contacts = (data ?? []) as Contact[]
        }
      }
    } catch {
      // Supabase auth failed gracefully, show empty state
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Contacts</h1>
        <Button size="sm">
          <Plus className="size-4" />
          Add Contact
        </Button>
      </div>

      <form className="relative max-w-sm" method="GET">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={query} placeholder="Search contacts..." className="pl-9" />
      </form>

      {contacts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {query ? `No contacts found for "${query}".` : 'No contacts yet. Add your first contact to get started.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {contacts.map(contact => (
            <ContactCard key={contact.id} contact={contact} />
          ))}
        </div>
      )}
    </div>
  )
}