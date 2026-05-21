import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { FileText, Tags, FolderTree, MessageSquare, Layers, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/blog")({
  component: BlogLayout,
});

const tabs = [
  { to: "/admin/blog", label: "Posts", icon: FileText, exact: true },
  { to: "/admin/blog/categorias", label: "Categorias", icon: FolderTree },
  { to: "/admin/blog/tags", label: "Tags", icon: Tags },
  { to: "/admin/blog/comentarios", label: "Comentários", icon: MessageSquare },
  { to: "/admin/blog/programaticas", label: "Programáticas", icon: Layers },
];

function BlogLayout() {
  const location = useLocation();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold mb-1">Blog & SEO</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie posts, categorias, tags, comentários e páginas programáticas.
          </p>
        </div>
        <Link
          to="/admin/equipe"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/20 transition"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Convidar editor
        </Link>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {tabs.map((t) => {
          const active = t.exact
            ? location.pathname === t.to
            : location.pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to as "/admin/blog"}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
