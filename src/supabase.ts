import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

// Clear expired tokens from sessionStorage BEFORE creating the client,
// so the client doesn't attempt to restore a stale/invalid session.
try {
  const key = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  const stored = sessionStorage.getItem(key);
  if (stored) {
    const parsed = JSON.parse(stored);
    const expiresAt: number = parsed?.expires_at;
    if (expiresAt > 0 && expiresAt * 1000 < Date.now()) {
      sessionStorage.removeItem(key);
    }
  }
} catch { /* not in browser, or JSON parse error — ignore */ }

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: sessionStorage,
  },
});
