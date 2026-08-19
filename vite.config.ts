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
//
// nitro.vercel.functions.runtime também é fixado: sem isso o Nitro escolhe
// o runtime da function com base na versão do Node (ou Bun, se detectar
// globalThis.Bun) que está rodando o BUILD, não a config do projeto na
// Vercel — então uma imagem de build diferente (ou a presença de um
// bun.lock) muda silenciosamente o runtime gerado sem nenhuma mudança de
// código, e uma versão não suportada pela plataforma quebra o site inteiro
// com 404 (a function nunca é provisionada).
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // O tipo exposto pelo wrapper só declara { preset, output, cloudflare },
  // mas repassa o objeto direto pro plugin `nitro()` real, que aceita
  // `vercel.functions.runtime` normalmente (confirmado em build local).
  //
  // NÃO condicionar em process.env.VERCEL: essa env var se mostrou
  // inconsistente entre os builds de preview e production desse projeto
  // (preview tinha, production não) — sem ela a condição caía no `undefined`
  // e o wrapper voltava a usar o fallback `cloudflare-module`, quebrando o
  // site de novo. Este projeto só é buildado para a Vercel, então forçar
  // sempre é seguro.
  // cache-bust: 2026-08-18-b (build cache da Vercel restaurou o vite.config.ts
  // de um deploy quebrado anterior e ignorou esta mudança; força novo hash).
  nitro: { preset: "vercel", vercel: { functions: { runtime: "nodejs22.x" } } } as {
    preset: string;
  },
});
