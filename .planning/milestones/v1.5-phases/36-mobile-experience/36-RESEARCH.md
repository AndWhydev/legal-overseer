# Phase 36: Mobile-First Experience - Research

**Researched:** 2026-03-28
**Domain:** React Native / Expo mobile app consuming existing Next.js API
**Confidence:** HIGH

## Summary

Phase 36 delivers a standalone React Native/Expo mobile app that connects to the existing BitBit Next.js backend. The web app already exposes a comprehensive REST + SSE API layer (100+ routes) with Supabase auth, streaming chat via `/api/agent/chat`, voice input via `/api/ai/voice`, approval management via `/api/agent/approvals`, and real-time event streaming via `/api/events`. The mobile app is a **consumer** of these existing APIs -- no backend changes are required for core functionality. The only new backend surface is a push notification dispatcher (Expo Push API or Supabase Edge Function) and a `push_tokens` table for device registration.

Expo SDK 55 (latest stable, released March 2026) ships with React Native 0.83, React 19.2, mandatory New Architecture, and Expo Router for file-based navigation. Supabase has first-class Expo support with `expo-sqlite` for session persistence (replacing the older AsyncStorage pattern). The critical architectural decisions are: (1) use Expo Router for navigation (familiar to Next.js developers via file-based routing), (2) use `@tanstack/react-query` with offline mutation persistence for the offline queue, (3) use `react-native-sse` for consuming the existing SSE streaming endpoints, and (4) use `expo-notifications` for push notifications backed by Expo Push Service (handles both APNs and FCM).

**Primary recommendation:** Build a focused mobile companion app (chat + approvals + notifications + quick actions) using Expo SDK 55 with Expo Router, consuming the existing API surface. Do not replicate the full dashboard -- mobile is for quick interactions, approvals, and voice-driven chat.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOB-01 | React Native/Expo mobile app with core chat functionality | Expo SDK 55 + Expo Router + react-native-sse for SSE streaming from `/api/agent/chat` |
| MOB-02 | Push notifications for alerts, approvals, and workflow triggers | expo-notifications + Expo Push Service + new `push_tokens` DB table + server-side dispatcher |
| MOB-03 | Voice input via device microphone for hands-free interaction | expo-audio for recording + existing `/api/ai/voice` endpoint (Whisper transcription) |
| MOB-04 | Offline queue -- messages queued when offline, synced when reconnected | @tanstack/react-query + @react-native-community/netinfo + AsyncStorage persistence |
| MOB-05 | Quick actions -- swipe/tap shortcuts for common operations | react-native-gesture-handler + expo-haptics + Swipeable rows for approve/reject/reply |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo | ~55.0 | Managed RN framework | Latest stable SDK, mandatory New Architecture, React 19.2 support |
| react-native | 0.83 | Mobile runtime | Ships with Expo SDK 55 |
| react | 19.2 | UI framework | Matches web app (React 19), shared mental model |
| expo-router | ~4.0 (SDK 55) | File-based navigation | Next.js-like file routing, deep linking built-in, stack/tabs/drawer |
| @supabase/supabase-js | ^2.95 | Backend client | Same version as web app, shared Supabase project |
| expo-sqlite | latest | Auth session storage | Official Supabase recommendation for Expo (replaces AsyncStorage for auth) |
| @tanstack/react-query | ^5.x | Server state + offline | Industry standard for data fetching, built-in offline mutation queue |
| typescript | ^5.9 | Type safety | Match web app TS version |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-notifications | ~0.32 | Push notifications | Token registration, notification handling, badge management |
| expo-device | ~7.0 | Device detection | Required by push notification registration (isDevice check) |
| expo-constants | ~17.0 | Project config | Required for EAS project ID in push token |
| expo-audio | ~0.4 | Voice recording | Microphone capture for voice input (replaces deprecated expo-av) |
| expo-secure-store | ~14.0 | Sensitive storage | Encryption keys, API tokens beyond Supabase session |
| expo-haptics | ~14.0 | Tactile feedback | Quick action confirmation (approve/reject swipes) |
| react-native-sse | ^2.0 | SSE client | Consuming `/api/agent/chat` and `/api/events` streaming endpoints |
| @react-native-community/netinfo | ~12.0 | Network status | Offline detection for queue management |
| react-native-gesture-handler | ~2.24 | Gesture system | Swipe-to-approve, swipe-to-dismiss quick actions |
| react-native-reanimated | ~3.17 | Animations | Smooth gesture animations, transitions |
| @tanstack/query-async-storage-persister | ^5.x | Query persistence | Persist mutation queue to AsyncStorage for offline survival |
| @react-native-async-storage/async-storage | ~2.1 | KV storage | Offline queue persistence, cached data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Expo Router | React Navigation directly | More boilerplate, no file-based routing, no deep linking auto-config |
| @tanstack/react-query | SWR or custom hooks | No built-in offline mutation queue, less mature RN support |
| react-native-sse | fetch + ReadableStream | Fetch streaming unreliable on Android (known RN issue #28835) |
| expo-audio | expo-av | expo-av deprecated in SDK 55, expo-audio is the stable replacement |
| Expo Push Service | Direct FCM/APNs | More infrastructure to manage, Expo handles credential routing automatically |
| expo-sqlite (for auth) | @react-native-async-storage | Supabase official recommendation changed to expo-sqlite for session persistence |

**Installation:**
```bash
# In the mobile app directory (e.g., /mobile or /apps/mobile)
npx create-expo-app@latest bitbit-mobile --template blank-typescript
cd bitbit-mobile

# Core
npx expo install expo-router expo-linking expo-constants expo-status-bar

# Supabase
npx expo install @supabase/supabase-js expo-sqlite

# Push Notifications
npx expo install expo-notifications expo-device

# Voice
npx expo install expo-audio

# Offline & Data
npm install @tanstack/react-query @tanstack/query-async-storage-persister @tanstack/react-query-persist-client
npx expo install @react-native-async-storage/async-storage @react-native-community/netinfo

# UI & Gestures
npx expo install react-native-gesture-handler react-native-reanimated expo-haptics expo-secure-store

# SSE
npm install react-native-sse
```

## Architecture Patterns

### Recommended Project Structure
```
mobile/
├── app/                         # Expo Router file-based routes
│   ├── _layout.tsx              # Root layout (auth check, providers)
│   ├── (auth)/                  # Auth group (login, signup)
│   │   ├── _layout.tsx          # Auth stack layout
│   │   ├── login.tsx            # Login screen
│   │   └── signup.tsx           # Signup screen
│   ├── (tabs)/                  # Main tab navigator
│   │   ├── _layout.tsx          # Tab bar layout
│   │   ├── chat.tsx             # Chat screen (primary)
│   │   ├── approvals.tsx        # Pending approvals list
│   │   ├── activity.tsx         # Activity feed / notifications
│   │   └── settings.tsx         # Settings
│   ├── chat/
│   │   └── [threadId].tsx       # Individual thread view
│   └── approval/
│       └── [id].tsx             # Approval detail
├── src/
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client (expo-sqlite storage)
│   │   ├── api.ts               # API client wrapping fetch to Next.js backend
│   │   ├── sse.ts               # SSE client for streaming chat + events
│   │   ├── push.ts              # Push notification registration + handling
│   │   ├── offline-queue.ts     # TanStack Query offline mutation config
│   │   └── voice.ts             # Audio recording + upload helper
│   ├── hooks/
│   │   ├── useAuth.ts           # Auth state hook (Supabase session)
│   │   ├── useChat.ts           # Chat interaction hook (send, stream, history)
│   │   ├── useApprovals.ts      # Approvals query + mutation hooks
│   │   ├── useNotifications.ts  # Notification state + badge count
│   │   ├── useOffline.ts        # Network status + queue indicator
│   │   └── useVoice.ts          # Voice recording state machine
│   ├── components/
│   │   ├── ChatBubble.tsx       # Message bubble (user/assistant)
│   │   ├── ChatInput.tsx        # Text + voice input bar
│   │   ├── ApprovalCard.tsx     # Swipeable approval card
│   │   ├── QuickAction.tsx      # Quick action button/gesture target
│   │   ├── OfflineBanner.tsx    # Offline indicator bar
│   │   └── StreamingText.tsx    # Streaming response renderer
│   └── providers/
│       ├── AuthProvider.tsx      # Supabase auth context
│       ├── QueryProvider.tsx     # TanStack Query + persister
│       └── NotificationProvider.tsx  # Push notification context
├── app.json                     # Expo config (plugins, scheme, etc.)
├── eas.json                     # EAS Build configuration
├── package.json
└── tsconfig.json
```

### Pattern 1: Supabase Client Initialization (Expo)
**What:** Initialize Supabase client with expo-sqlite localStorage for session persistence
**When to use:** App startup, all data operations
**Example:**
```typescript
// src/lib/supabase.ts
// Source: https://docs.expo.dev/guides/using-supabase/
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,  // expo-sqlite backed
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,  // No URL session in RN
  },
});
```

### Pattern 2: SSE Streaming Chat Consumer
**What:** Consume the existing `/api/agent/chat` SSE endpoint from React Native
**When to use:** Chat screen, sending messages and receiving streaming responses
**Example:**
```typescript
// src/lib/sse.ts
import EventSource from 'react-native-sse';
import { supabase } from './supabase';

export function streamChat(
  message: string,
  threadId: string | null,
  onEvent: (event: { type: string; data: unknown }) => void,
  onDone: () => void,
  onError: (err: Error) => void,
) {
  // Get current session token for auth
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      onError(new Error('Not authenticated'));
      return;
    }

    // The existing /api/agent/chat is a POST that returns SSE
    // react-native-sse supports custom methods
    const baseUrl = process.env.EXPO_PUBLIC_API_URL!;
    const es = new EventSource(`${baseUrl}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message, threadId }),
    });

    es.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onEvent(parsed);
      } catch { /* skip malformed */ }
    });

    es.addEventListener('error', (event) => {
      onError(new Error('Stream error'));
      es.close();
    });

    // Close when stream ends
    es.addEventListener('close', () => {
      onDone();
    });
  });
}
```

### Pattern 3: Offline Mutation Queue
**What:** Queue mutations (messages, approvals) when offline, auto-sync on reconnect
**When to use:** All write operations
**Example:**
```typescript
// src/providers/QueryProvider.tsx
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Wire NetInfo to TanStack Query's online manager
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      gcTime: 1000 * 60 * 60 * 24, // 24 hr
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'BITBIT_QUERY_CACHE',
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
```

### Pattern 4: Push Token Registration
**What:** Register device push token with backend, store in `push_tokens` table
**When to use:** After successful auth, on app foreground resume
**Example:**
```typescript
// src/lib/push.ts
// Source: https://docs.expo.dev/push-notifications/push-notifications-setup/
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // No push on simulator

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'BitBit',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  // Store token in Supabase push_tokens table
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('push_tokens').upsert({
      user_id: user.id,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });
  }

  return token;
}
```

### Pattern 5: Auth Guard with Expo Router
**What:** Redirect unauthenticated users to login using Expo Router layout
**When to use:** Root layout
**Example:**
```typescript
// app/_layout.tsx
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) router.replace('/login');
    else if (session && inAuthGroup) router.replace('/chat');
  }, [session, segments, loading]);

  if (loading) return null; // or splash screen
  return <Slot />;
}
```

### Anti-Patterns to Avoid
- **Replicating the full web dashboard:** Mobile app should focus on chat, approvals, and quick actions -- not replicate every dashboard tab. Users needing full control use the web app.
- **Building a custom auth flow:** Use Supabase Auth directly -- same auth system as web, shared session semantics, same RLS policies work.
- **Polling instead of SSE/Realtime:** The backend already provides SSE endpoints and Supabase Realtime. Do not poll for updates.
- **Storing auth tokens in AsyncStorage unencrypted:** Use expo-sqlite (Supabase recommended) or expo-secure-store for sensitive data.
- **Using expo-av for audio:** Deprecated in SDK 55. Use expo-audio instead.
- **Building custom SSE parser:** Use react-native-sse library -- Android's fetch API has known issues with streaming (RN issue #28835).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push notification delivery | Custom APNs/FCM integration | Expo Push Service | Handles credential routing, retries, token management for both platforms |
| Offline mutation queue | Custom queue with AsyncStorage | @tanstack/react-query + persister | Built-in retry, dedup, persistence, online/offline state machine |
| Network status detection | Manual polling or event listeners | @react-native-community/netinfo + TanStack onlineManager | Handles all edge cases (airplane mode, wifi-without-internet, cellular) |
| SSE parsing in React Native | Custom fetch + ReadableStream parser | react-native-sse | Android fetch streaming is broken (RN #28835), library uses XMLHttpRequest |
| Navigation + deep linking | Custom linking config + React Navigation | Expo Router | File-based routing auto-generates deep link config, handles universal links |
| Auth session persistence | Manual token management | Supabase SSR client + expo-sqlite | Token refresh, session expiry, multi-tab sync handled automatically |
| Swipe gestures | PanResponder | react-native-gesture-handler | Native thread gesture processing, no JS bridge jank |
| Audio recording | MediaRecorder polyfill | expo-audio | Native audio engine, proper permission handling, format negotiation |

**Key insight:** This mobile app is a thin client consuming an existing API. The web app already handles all business logic, AI processing, and data management. The mobile app's complexity is in UX (offline queue, gestures, push) -- not in business logic.

## Common Pitfalls

### Pitfall 1: SSE Streaming on Android
**What goes wrong:** React Native's built-in fetch API does not properly handle SSE/text-event-stream on Android. Events may buffer or never arrive.
**Why it happens:** Android's OkHttp (used by RN's fetch) buffers chunked responses differently than web browsers.
**How to avoid:** Use `react-native-sse` which uses XMLHttpRequest internally (bypasses the fetch issue). The existing `/api/agent/chat` endpoint returns standard SSE format (`data: {...}\n\n`) which the library handles correctly.
**Warning signs:** Chat messages appear all at once after stream closes instead of token-by-token.

### Pitfall 2: Push Notifications on Simulators
**What goes wrong:** Push notification registration silently fails on iOS Simulator and Android Emulator.
**Why it happens:** Neither simulator supports push notification services (APNs/FCM).
**How to avoid:** Always wrap push registration in `Device.isDevice` check. Test push on physical devices via EAS Build development client.
**Warning signs:** `getExpoPushTokenAsync` throws or returns undefined silently.

### Pitfall 3: Auth Token Expiry During Background
**What goes wrong:** App returns from background with expired Supabase JWT, API calls fail with 401.
**Why it happens:** Mobile apps can be backgrounded for hours/days. Supabase tokens expire (default 3600s).
**How to avoid:** Supabase client with `autoRefreshToken: true` handles this. Additionally, check session on `AppState` 'active' event and refresh if needed. The existing API routes already validate via `supabase.auth.getUser()` which triggers refresh.
**Warning signs:** Users get "Unauthorized" errors after opening app from background.

### Pitfall 4: Offline Queue Replay Ordering
**What goes wrong:** Queued mutations replay in wrong order or duplicate.
**Why it happens:** TanStack Query mutation persistence requires explicit `mutationKey` and default mutation functions for proper resume after app restart.
**How to avoid:** Define `mutationKey` on all persisted mutations. Use `onMutate` optimistic updates with `onSettled` cache invalidation. Set `networkMode: 'offlineFirst'` on mutations.
**Warning signs:** Messages appear duplicated after coming back online, or queue never drains.

### Pitfall 5: Expo Config Plugins Not Applied
**What goes wrong:** Native permissions (microphone, notifications) not in Info.plist or AndroidManifest.
**Why it happens:** Forgot to add config plugins to app.json or forgot to run `npx expo prebuild`.
**How to avoid:** Ensure app.json plugins array includes expo-notifications, expo-audio, and any other native modules. With EAS Build or local prebuild, plugins are applied automatically.
**Warning signs:** Permission dialogs never appear, or app crashes on permission request.

### Pitfall 6: Supabase Environment Variables
**What goes wrong:** Supabase client returns null, all API calls fail.
**Why it happens:** Expo requires `EXPO_PUBLIC_` prefix for client-side environment variables (unlike Next.js `NEXT_PUBLIC_`).
**How to avoid:** Use `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`. The Supabase URL and anon key are the same as the web app.
**Warning signs:** "Not configured" errors on app launch.

## Code Examples

### Voice Input Recording and Upload
```typescript
// src/hooks/useVoice.ts
import { useRef, useState, useCallback } from 'react';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';

export function useVoice(onTranscript: (text: string, response: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) return;

    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  }, [recorder]);

  const stopAndSend = useCallback(async () => {
    await recorder.stop();
    setIsRecording(false);

    const uri = recorder.uri;
    if (!uri) return;

    // Upload to existing /api/ai/voice endpoint
    const formData = new FormData();
    formData.append('audio', {
      uri,
      type: 'audio/m4a',
      name: 'voice.m4a',
    } as unknown as Blob);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}/api/ai/voice`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: formData,
    });

    const { transcript, response } = await res.json();
    if (transcript) onTranscript(transcript, response);
  }, [recorder, onTranscript]);

  return { isRecording, startRecording, stopAndSend };
}
```

### Swipeable Approval Card (Quick Actions)
```typescript
// src/components/ApprovalCard.tsx
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  approval: { id: string; title: string; body: string; urgency: string };
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ApprovalCard({ approval, onApprove, onReject }: Props) {
  const renderRightActions = () => (
    <View style={styles.rejectAction}>
      <Text style={styles.actionText}>Reject</Text>
    </View>
  );

  const renderLeftActions = () => (
    <View style={styles.approveAction}>
      <Text style={styles.actionText}>Approve</Text>
    </View>
  );

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={(direction) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (direction === 'left') onApprove(approval.id);
        else onReject(approval.id);
      }}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{approval.title}</Text>
        <Text style={styles.body}>{approval.body}</Text>
      </View>
    </Swipeable>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| expo-av for audio | expo-audio | SDK 53 (stable), SDK 55 (expo-av removed from Expo Go) | Must use expo-audio for recording |
| AsyncStorage for Supabase auth | expo-sqlite/localStorage | SDK 55 / Supabase docs 2026 | Official Supabase recommendation for Expo |
| Legacy Architecture optional | New Architecture mandatory | SDK 55 (March 2026) | All packages must support New Architecture |
| React Navigation manual config | Expo Router file-based | SDK 50+ (mature in SDK 55) | File-based routing standard for new Expo apps |
| Custom push infrastructure | Expo Push Service | Stable since SDK 48+ | Abstracts APNs/FCM, handles credentials |
| Manual deep linking config | Expo Router auto deep links | SDK 52+ | File routes auto-generate deep link config |
| expo-permissions package | Per-module permissions | SDK 46+ | expo-permissions deprecated, each module has own requestPermissionsAsync |

**Deprecated/outdated:**
- `expo-av`: Removed from Expo Go in SDK 55. Use `expo-audio` for recording.
- `expo-permissions`: Deprecated. Each module handles its own permissions.
- Legacy Architecture: Cannot be used in SDK 55+. New Architecture is mandatory.
- `@react-native-async-storage/async-storage` for Supabase auth: Replaced by `expo-sqlite` in official docs.

## Open Questions

1. **Apple Developer Account and FCM Credentials**
   - What we know: Push notifications require APNs credentials (Apple Developer Program, $99/year) and FCM v1 service account for Android
   - What's unclear: Whether the BitBit project already has an Apple Developer account and Firebase project
   - Recommendation: Verify credential availability before planning push notification tasks. EAS Build handles credential generation if Apple Developer account exists.

2. **EAS Build vs Local Builds**
   - What we know: EAS Build is Expo's cloud build service. Local builds require Xcode (Mac) and Android Studio.
   - What's unclear: Whether the development environment has EAS configured and whether paid EAS plan is needed
   - Recommendation: Start with EAS Build (free tier includes 15 iOS + 15 Android builds/month). Use development client for iterative development.

3. **App Store Distribution Strategy**
   - What we know: Phase goal is "React Native/Expo mobile app" but doesn't specify distribution
   - What's unclear: Whether this is TestFlight/internal testing only or App Store submission
   - Recommendation: Plan for development builds and TestFlight initially. App Store submission requires review compliance (privacy policy, data handling disclosures).

4. **Backend API Authentication for Mobile**
   - What we know: The web app uses cookie-based auth via `@supabase/ssr` with `createServerClient`. The `/api/events` SSE endpoint already supports Bearer token auth.
   - What's unclear: Whether all API routes support Bearer token auth or only cookie-based
   - Recommendation: The `/api/agent/chat` route uses `createClient()` (cookie-based). Mobile will need to either: (a) pass Bearer token and have routes validate via `supabase.auth.getUser(token)`, or (b) add a thin API adapter. The `/api/events` route already shows the Bearer pattern -- extend to chat and other routes.

## Validation Architecture

> workflow.nyquist_validation is not explicitly set to false in config.json. Including validation section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (existing) + Jest (Expo default for RN-specific tests) |
| Config file | `mobile/vitest.config.ts` (new) or `jest.config.js` (Expo default) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test` (in mobile directory) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOB-01 | Chat sends message and receives streamed response | integration | `npx vitest run src/__tests__/chat-stream.test.ts -x` | Wave 0 |
| MOB-01 | Supabase client initializes with expo-sqlite storage | unit | `npx vitest run src/__tests__/supabase-client.test.ts -x` | Wave 0 |
| MOB-02 | Push token registered and stored in push_tokens table | unit | `npx vitest run src/__tests__/push-registration.test.ts -x` | Wave 0 |
| MOB-02 | Notification received triggers correct handler | integration | Manual (device-only) | N/A |
| MOB-03 | Voice recording produces audio file and uploads | unit | `npx vitest run src/__tests__/voice-input.test.ts -x` | Wave 0 |
| MOB-04 | Mutations queue when offline and replay on reconnect | unit | `npx vitest run src/__tests__/offline-queue.test.ts -x` | Wave 0 |
| MOB-04 | NetInfo state changes wire to TanStack onlineManager | unit | `npx vitest run src/__tests__/network-status.test.ts -x` | Wave 0 |
| MOB-05 | Swipe gesture triggers approve/reject mutation | unit | `npx vitest run src/__tests__/quick-actions.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** Full test suite in mobile directory
- **Phase gate:** Full suite green + manual device test on iOS and Android

### Wave 0 Gaps
- [ ] `mobile/` -- entire directory needs creation (new Expo project)
- [ ] `mobile/vitest.config.ts` or `mobile/jest.config.js` -- test framework config
- [ ] `mobile/src/__tests__/` -- all test files listed above
- [ ] DB migration for `push_tokens` table
- [ ] Backend API route for push token registration
- [ ] Backend push notification dispatcher (Expo Push API integration)

## Sources

### Primary (HIGH confidence)
- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55) - SDK version, React Native 0.83, React 19.2, New Architecture mandatory
- [Expo Push Notifications Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) - Push token registration, credential setup
- [Expo Supabase Guide](https://docs.expo.dev/guides/using-supabase/) - Client initialization with expo-sqlite
- [Expo Router Introduction](https://docs.expo.dev/router/introduction/) - File-based routing, deep linking
- [Expo Audio docs](https://docs.expo.dev/versions/latest/sdk/audio/) - expo-audio stable replacement for expo-av
- [Expo Notifications API](https://docs.expo.dev/versions/latest/sdk/notifications/) - Notification handling, permissions
- [Expo Haptics](https://docs.expo.dev/versions/latest/sdk/haptics/) - Haptic feedback API

### Secondary (MEDIUM confidence)
- [Supabase Auth React Native Quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native) - Auth patterns for RN
- [Supabase Push Notifications Guide](https://supabase.com/docs/guides/functions/examples/push-notifications) - Edge function push dispatch
- [react-native-sse GitHub](https://github.com/binaryminds/react-native-sse) - SSE client for RN
- [TanStack Query Offline Example](https://tanstack.com/query/v4/docs/framework/react/examples/offline) - Offline mutation patterns
- [Whitespectre Offline-First Guide](https://www.whitespectre.com/ideas/how-to-build-offline-first-react-native-apps-with-react-query-and-typescript/) - TanStack Query offline architecture

### Tertiary (LOW confidence)
- [React Native SSE issue #28835](https://github.com/facebook/react-native/issues/28835) - Fetch streaming broken on Android (verified by multiple sources)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Expo SDK 55 is current stable, all libraries verified against official docs
- Architecture: HIGH - Pattern is straightforward (mobile client consuming existing API), well-documented
- Pitfalls: HIGH - Known RN issues (SSE on Android, push on simulators) verified across multiple sources
- Offline queue: MEDIUM - TanStack Query persistence works but has edge cases with mutation replay ordering per GitHub discussions
- Backend changes: MEDIUM - Push notification dispatcher and Bearer token auth adaptation need implementation verification

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (Expo SDK 56 expected Q2 2026, but SDK 55 will remain supported)
