import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;

const supabaseUrl =
  env.VITE_SUPABASE_URL ||
  env.REACT_APP_SUPABASE_URL ||
  'https://wwehouchqznsvnrosaeb.supabase.co';

const supabasePublishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ||
  env.REACT_APP_SUPABASE_ANON_KEY ||
  'sb_publishable_lP5X_egPBmD__qqKPjyoyg_M4iNUj_C';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
