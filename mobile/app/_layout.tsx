import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { OfflineBanner } from '@/components/OfflineBanner';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/chat');
    }
  }, [session, segments, loading]);

  if (loading) return null;

  // NotificationProvider registers push token and handles notifications
  // Only mount when authenticated (needs Bearer token for API calls)
  if (session) {
    return (
      <NotificationProvider>
        <View style={{ flex: 1 }}>
          <OfflineBanner />
          {children}
        </View>
      </NotificationProvider>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <QueryProvider>
          <AuthGuard>
            <StatusBar style="auto" />
            <Slot />
          </AuthGuard>
        </QueryProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
