import { redirect } from 'next/navigation'
import { ContactCard } from '@/components/contacts/contact-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Search } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { Contact } from '@/lib/types'

export default async function ContactsPage() {
  let contacts: Contact[] = []

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { data: { user } } = await supabase!.auth.getUser()
    if (!user) redirect('/login')

    const { data } = await supabase!
      .from('contacts')
      .select('*')
      .order('name')

    contacts = (data ?? []) as Contact[]
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <Button size="sm">
          <Plus className="size-4" />
          Add Contact
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search contacts..." className="pl-9" />
      </div>

      {contacts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No contacts yet. Add your first contact to get started.
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
