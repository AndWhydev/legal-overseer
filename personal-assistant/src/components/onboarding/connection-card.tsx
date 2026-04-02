'use client'

import { motion, AnimatePresence } from 'motion/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, Calendar } from 'lucide-react'

interface ConnectionCardProps {
  visible: boolean
  onConnect: (provider: string) => void
}

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail', icon: Mail, oauthPath: '/api/channels/oauth/gmail' },
  { id: 'outlook', label: 'Outlook', icon: Mail, oauthPath: '/api/channels/oauth/outlook' },
  { id: 'google-calendar', label: 'Calendar', icon: Calendar, oauthPath: '/api/channels/oauth/google-calendar' },
]

export function ConnectionCard({ visible, onConnect }: ConnectionCardProps) {
  const handleConnect = (provider: typeof PROVIDERS[number]) => {
    document.cookie = 'bb-onboarding-active=1; path=/; max-age=3600; SameSite=Lax'
    onConnect(provider.id)
    window.location.href = `${provider.oauthPath}?return=/onboard`
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-24 right-6 z-50"
        >
          <Card className="w-72 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Connect an account</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {PROVIDERS.map(provider => (
                <Button
                  key={provider.id}
                  variant="outline"
                  className="justify-start gap-3 h-11"
                  onClick={() => handleConnect(provider)}
                >
                  <provider.icon className="h-4 w-4" />
                  {provider.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
