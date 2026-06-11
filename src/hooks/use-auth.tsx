import { useEffect, useState, useCallback } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-custom/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up listener BEFORE getting session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      setLoading(false);
    });

    // Mantém a sessão viva quando o PWA volta ao foco (evita "deslogar" depois de dias parado)
    const refresh = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            // força refresh do JWT se estiver perto de expirar
            const expIn = (data.session.expires_at ?? 0) * 1000 - Date.now();
            if (expIn < 5 * 60_000) {
              supabase.auth.refreshSession().catch(() => {/* silencioso */});
            }
          }
        });
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);


  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, session, loading, signOut };
}
