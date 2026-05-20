import { Link } from "@tanstack/react-router";
import logo from "@/assets/logo-fastproxy.png";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/30 mt-10">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <img src={logo} alt="FastProxy" className="h-10 mb-4" />
            <p className="text-muted-foreground max-w-md leading-relaxed">
              Proxies IPv6, IPv4 e ISP dedicados no Brasil. Velocidade real,
              reposição garantida, suporte 24/7.
            </p>
          </div>

          <div>
            <h4 className="font-bold mb-4">Produto</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><a href="#planos" className="hover:text-foreground transition">Planos</a></li>
              <li><a href="#beneficios" className="hover:text-foreground transition">Benefícios</a></li>
              <li><a href="#faq" className="hover:text-foreground transition">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4">Conta</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><Link to="/login" className="hover:text-foreground transition">Entrar</Link></li>
              <li><Link to="/signup" className="hover:text-foreground transition">Criar conta</Link></li>
              <li><Link to="/dashboard" className="hover:text-foreground transition">Painel</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} FastProxy. Todos os direitos reservados.</p>
          <p>Feito no Brasil 🇧🇷</p>
        </div>
      </div>
    </footer>
  );
}
