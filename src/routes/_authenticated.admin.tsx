import { createFileRoute, Outlet, Link, useLocation, redirect } from "@tanstack/react-router";
import { Shield, Package, Users, Receipt, ServerCog, Activity, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

const adminNav = [
  { to: "/admin", label: "Visão geral", icon: Activity },
  { to: "/admin/inventory", label: "Estoque", icon: Package },
  { to: "/admin/orders", label: "Pedidos", icon: Receipt },
  { to: "/admin/customers", label: "Clientes", icon: Users },
  { to: "/admin/provider", label: "Provedor", icon: ServerCog },
] as const;

function AdminLayout() {
  const location = useLocation();

  return (
    <div className="max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao painel
        </Link>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-wider">
          <Shield className="w-3 h-3" /> Admin
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 overflow-x-auto pb-2 border-b border-border">
        {adminNav.map((item) => {
          const active =
            item.to === "/admin"
              ? location.pathname === "/admin"
              : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
