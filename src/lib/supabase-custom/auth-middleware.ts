// Custom auth middleware — validates JWT against user's own Supabase project.
import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.CUSTOM_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.CUSTOM_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Missing CUSTOM_SUPABASE_URL / CUSTOM_SUPABASE_ANON_KEY');
    }

    const request = getRequest();
    if (!request?.headers) throw new Error('Unauthorized: No request headers');

    const authHeader = request.headers.get('authorization');
    if (!authHeader) throw new Error('Unauthorized: No authorization header');
    if (!authHeader.startsWith('Bearer ')) throw new Error('Unauthorized: Bearer only');

    const token = authHeader.replace('Bearer ', '');
    if (!token) throw new Error('Unauthorized: No token');

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) throw new Error('Unauthorized: Invalid token');
    if (!data.claims.sub) throw new Error('Unauthorized: No user ID');

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
