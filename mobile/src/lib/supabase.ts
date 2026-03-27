// Polyfill localStorage with expo-sqlite (official Supabase recommendation for Expo)
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage, // expo-sqlite backed
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // No URL session in React Native
  },
});
