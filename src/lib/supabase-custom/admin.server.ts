// Custom Supabase admin client (service_role) — server-only.
// URL vem do config (público); a chave secreta vem de FP_SUPABASE_SECRET_KEY.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { FP_SUPABASE_URL } from './config';

function createSupabaseAdminClient() {
  const SUPABASE_URL = FP_SUPABASE_URL;
  const SECRET_KEY =
    process.env['FP_SUPABASE_SECRET_KEY'] ?? process.env['CUSTOM_SUPABASE_SERVICE_ROLE_KEY'];

  if (!SECRET_KEY) {
    throw new Error('Missing secret(s): FP_SUPABASE_SECRET_KEY');
  }

  return createClient<Database>(SUPABASE_URL, SECRET_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      // Chaves no formato sb_secret_* são opacas (não são JWT): PostgREST só
      // aceita se o header apikey estiver presente e sem Bearer duplicado.
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (SECRET_KEY.startsWith('sb_') && headers.get('Authorization') === `Bearer ${SECRET_KEY}`) {
          headers.delete('Authorization');
        }
        headers.set('apikey', SECRET_KEY);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
