// Carrega config de ambiente a partir do Supabase (tabela public.app_env).
// Regra: o que já estiver em process.env ganha (envs explícitas de infra —
// ex.: FP_SUPABASE_SECRET_KEY — nunca são sobrescritas). O que faltar é
// preenchido a partir do banco, assim os segredos moram no Supabase e não
// no GitHub/Vercel.
//
// A tabela app_env tem RLS e sem políticas: só a service_role consegue ler.
// Para isso precisamos da FP_SUPABASE_SECRET_KEY disponível em process.env
// (bootstrap). Se faltar, o loader falha silenciosamente e o resto do app
// continua (as rotas que precisam do segredo é que dão erro próprio).

let hydratePromise: Promise<void> | undefined;

export function hydrateEnvFromDb(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const { supabaseAdmin } = await import("@/lib/supabase-custom/admin.server");
        const { data, error } = await supabaseAdmin.from("app_env").select("key, value");
        if (error) {
          console.error("[env-from-db] erro ao ler app_env:", error.message);
          return;
        }
        let n = 0;
        for (const row of data ?? []) {
          const k = row.key as string;
          const v = row.value as string;
          const current = process.env[k];
          if ((current === undefined || current === "") && v !== "") {
            process.env[k] = v;
            n++;
          }
        }
        console.log(`[env-from-db] ${n} variaveis carregadas do Supabase (total ${data?.length ?? 0})`);
      } catch (e) {
        console.error("[env-from-db] falha ao hidratar env:", e instanceof Error ? e.message : e);
      }
    })();
  }
  return hydratePromise;
}
