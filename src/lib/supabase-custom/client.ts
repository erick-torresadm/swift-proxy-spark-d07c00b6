// Supabase browser client — projeto próprio (self-hosted Supabase).
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { FP_SUPABASE_PUBLISHABLE_KEY, FP_SUPABASE_URL } from './config';

const SUPABASE_URL = FP_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = FP_SUPABASE_PUBLISHABLE_KEY;

function createSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

export const SUPABASE_PROJECT_URL = SUPABASE_URL;
export const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;
