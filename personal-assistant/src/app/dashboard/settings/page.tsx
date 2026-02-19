'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { IntegrationGrid } from '@/components/integrations/integration-grid'

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card className="max-w-lg border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Your Profile</CardTitle>
              <CardDescription>Manage your account details.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Display Name
                </label>
                <Input defaultValue="Tor Kay" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Email
                </label>
                <Input defaultValue="contact@torkay.com" disabled />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Organization
                </label>
                <Input defaultValue="Torkay Digital" disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationGrid />
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card className="max-w-lg border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Preferences</CardTitle>
              <CardDescription>
                Customize your assistant behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Autonomy Level</p>
                  <p className="text-xs">How much the agent can do without asking</p>
                </div>
                <Badge variant="outline">Medium</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Communication Style</p>
                  <p className="text-xs">Agent response verbosity</p>
                </div>
                <Badge variant="outline">Concise</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Default Email Action</p>
                  <p className="text-xs">What to do with outgoing emails</p>
                </div>
                <Badge variant="outline">Draft</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
