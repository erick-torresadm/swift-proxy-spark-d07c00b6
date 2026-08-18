// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
//
// nitro.preset é forçado para "vercel": o defaultPreset do wrapper cai para
// "cloudflare-module" quando a auto-detecção da plataforma falha, o que gera
// um build no formato Cloudflare Workers (wrangler.json) em vez do Vercel
// Build Output API — a Vercel então não encontra nenhuma function/rota e o
// site inteiro responde 404. Setar explícito evita depender da autodetecção.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: process.env.VERCEL ? { preset: "vercel" } : undefined,
});
