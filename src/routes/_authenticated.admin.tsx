import { createFileRoute, Outlet, Link, useLocation, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Shield, Package, Users, Receipt, ServerCog, Activity, ArrowLeft, Mail, DollarSign, Wrench, AlertCircle, MessageCircle, Megaphone, FileText, Users2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { countOpenIssues } from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof Activity;
  exact?: boolean;
  badge?: "issues";
};

const adminNav: NavItem[] = [
  { to: "/admin", label: "Visão geral", icon: Activity, exact: true },
  { to: "/admin/allocations", label: "Operação", icon: Wrench, badge: "issues" },
  { to: "/admin/chat", label: "Chat ao vivo", icon: MessageCircle },
  { to: "/admin/broadcast", label: "Notificações", icon: Megaphone },
  { to: "/admin/inventory", label: "Estoque", icon: Package },
  { to: "/admin/pricing", label: "Preços", icon: DollarSign },
  { to: "/admin/orders", label: "Pedidos", icon: Receipt },
  { to: "/admin/customers", label: "Clientes", icon: Users },
  { to: "/admin/provider", label: "Provedor", icon: ServerCog },
  { to: "/admin/emails", label: "Emails", icon: Mail },
];

function AdminLayout() {
  const location = useLocation();
  const fetchIssues = useServerFn(countOpenIssues);
  const { data: issues } = useQuery({
    queryKey: ["admin-open-issues"],
    queryFn: () => fetchIssues(),
    refetchInterval: 30_000,
  });

  return (
    <div className="-m-6 sm:-m-8 lg:-m-10 lg:-mt-10 -mt-16 flex flex-col lg:flex-row min-h-[calc(100vh-0px)]">
      {/* Sub-sidebar do admin */}
      <aside className="lg:w-60 lg:shrink-0 lg:border-r border-b lg:border-b-0 border-border bg-card/40 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="p-4 lg:p-6">
          <Link
            to="/dashboard"
            className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao painel
          </Link>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-wider mb-4">
            <Shield className="w-3 h-3" /> Admin
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {adminNav.map((item) => {
              const active = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              const showBadge = item.badge === "issues" && (issues?.count ?? 0) > 0;
              return (
                <Link
                  key={item.to}
                  to={item.to as "/admin"}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                      <AlertCircle className="w-3 h-3" /> {issues?.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 sm:p-8 lg:p-10">
        <Outlet />
      </main>
    </div>
  );
}
