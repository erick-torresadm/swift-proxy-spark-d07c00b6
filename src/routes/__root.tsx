import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatWidget } from "@/components/site/ChatWidget";
import { CookieBanner } from "@/components/site/CookieBanner";
import { ThemeProvider, themeInitScript, useTheme } from "@/lib/theme";
import { CurrencyProvider } from "@/lib/currency";
import "@/lib/i18n";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-8xl font-black text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            Voltar para a Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente novamente em alguns segundos.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0f172a" },
      { title: "FastProxy — Proxy IPv6, IPv4 e ISP Dedicado no Brasil | Melhor Preço" },
      {
        name: "description",
        content:
          "FastProxy: proxies HTTP e SOCKS5 dedicados no Brasil. IPv6 a partir de R$29,90/mês, IPv4 e ISP. Alta velocidade, entrega automática em segundos e suporte 24/7.",
      },
      { name: "keywords", content: "proxy brasil, proxy ipv6, proxy ipv4, proxy isp, proxy dedicado, proxy socks5, proxy http, comprar proxy, proxy barato, proxy instagram, proxy whatsapp" },
      { name: "author", content: "FastProxy" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { name: "googlebot", content: "index, follow" },
      { property: "og:site_name", content: "FastProxy" },
      { property: "og:title", content: "FastProxy — Proxy IPv6, IPv4 e ISP Dedicado no Brasil" },
      {
        property: "og:description",
        content:
          "Proxies HTTP e SOCKS5 dedicados no Brasil a partir de R$29,90/mês. IPv6, IPv4 e ISP. Entrega automática, alta velocidade, suporte 24/7.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:locale:alternate", content: "en_US" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3b969835-bfe1-4be1-801a-a2a65a503ba7/id-preview-de2ea58d--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app-1779313845271.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@fastproxybr" },
      { name: "twitter:title", content: "FastProxy — Proxy IPv6, IPv4 e ISP Dedicado no Brasil" },
      { name: "twitter:description", content: "Proxies dedicados no Brasil a partir de R$29,90/mês. IPv6, IPv4 e ISP. Entrega automática e suporte 24/7." },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3b969835-bfe1-4be1-801a-a2a65a503ba7/id-preview-de2ea58d--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app-1779313845271.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700;800&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://swift-proxy-spark.lovable.app/#org",
              name: "FastProxy",
              url: "https://swift-proxy-spark.lovable.app",
              logo: "https://swift-proxy-spark.lovable.app/icon-512.png",
              sameAs: ["https://twitter.com/fastproxybr"],
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                availableLanguage: ["Portuguese", "English"],
                areaServed: "BR",
              },
            },
            {
              "@type": "WebSite",
              "@id": "https://swift-proxy-spark.lovable.app/#site",
              url: "https://swift-proxy-spark.lovable.app",
              name: "FastProxy",
              publisher: { "@id": "https://swift-proxy-spark.lovable.app/#org" },
              inLanguage: "pt-BR",
              potentialAction: {
                "@type": "SearchAction",
                target: "https://swift-proxy-spark.lovable.app/blog?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CurrencyProvider>
          <AuthSync />
          <Outlet />
          <ChatWidget />
          <CookieBanner />
          <ThemedToaster />
        </CurrencyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-right" richColors closeButton />;
}

function AuthSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}
