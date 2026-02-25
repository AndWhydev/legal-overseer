'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { IntegrationGrid } from '@/components/integrations/integration-grid';
import { Sun, Moon } from 'lucide-react';

function SettingsTab() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bitbit-theme') as 'dark' | 'light' | null;
      if (saved) setTheme(saved);
      else setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.className = next;
    try { localStorage.setItem('bitbit-theme', next); } catch { /* ignore */ }
  }, [theme]);

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
                <label className="mb-1.5 block text-sm text-muted-foreground">Display Name</label>
                <Input defaultValue="Tor Kay" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Email</label>
                <Input defaultValue="contact@torkay.com" disabled />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">Organization</label>
                <Input defaultValue="Torkay Digital" disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationGrid />
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <div className="flex flex-col gap-4 max-w-lg">
            {/* Theme Toggle */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Theme</CardTitle>
                <CardDescription>Switch between dark and light mode.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? (
                      <Moon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Sun className="h-4 w-4 text-amber-500" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">
                        {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {theme === 'dark' ? 'Easy on the eyes' : 'Bright and clean'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      background: theme === 'light'
                        ? 'var(--bb-orange, #FF5A1F)'
                        : 'rgba(255,255,255,0.12)',
                    }}
                    role="switch"
                    aria-checked={theme === 'light'}
                    aria-label="Toggle theme"
                  >
                    <span
                      className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out"
                      style={{
                        transform: theme === 'light' ? 'translateX(20px)' : 'translateX(2px)',
                        marginTop: 2,
                      }}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Other Preferences */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Preferences</CardTitle>
                <CardDescription>Customize your assistant behavior.</CardDescription>
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default React.memo(SettingsTab);
