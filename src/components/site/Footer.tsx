import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Mail, MessageCircle, Send, Instagram } from "lucide-react";
import logo from "@/assets/logo-fastproxy.png";
import { CONTACT, whatsappUrl } from "@/config/contact";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-card/30 mt-10">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-6 gap-10 mb-12">
          <div className="md:col-span-2">
            <img src={logo} alt="FastProxy" className="h-10 mb-4" />
            <p className="text-muted-foreground max-w-md leading-relaxed mb-5">
              {t("footer.tagline")}
            </p>
            <div className="flex items-center gap-2">
              <a
                href={whatsappUrl()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="w-10 h-10 rounded-full bg-foreground/5 hover:bg-[#25D366] hover:text-white text-foreground/70 flex items-center justify-center transition"
              >
                <MessageCircle className="w-4 h-4" fill="currentColor" />
              </a>
              <a
                href={CONTACT.telegram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="w-10 h-10 rounded-full bg-foreground/5 hover:bg-[#229ED9] hover:text-white text-foreground/70 flex items-center justify-center transition"
              >
                <Send className="w-4 h-4" />
              </a>
              <a
                href={CONTACT.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-10 h-10 rounded-full bg-foreground/5 hover:bg-gradient-to-br hover:from-purple-500 hover:via-pink-500 hover:to-orange-400 hover:text-white text-foreground/70 flex items-center justify-center transition"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href={`mailto:${CONTACT.email}`}
                aria-label="E-mail"
                className="w-10 h-10 rounded-full bg-foreground/5 hover:bg-primary hover:text-primary-foreground text-foreground/70 flex items-center justify-center transition"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-4">Produtos</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><Link to="/proxy-ipv6" className="hover:text-foreground transition">Proxy IPv6</Link></li>
              <li><Link to="/proxy-ipv4" className="hover:text-foreground transition">Proxy IPv4</Link></li>
              <li><Link to="/proxy-isp" className="hover:text-foreground transition">Proxy ISP</Link></li>
              <li><Link to="/proxy-facebook-ads" className="hover:text-foreground transition">Proxy Facebook Ads</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4">{t("footer.product")}</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><a href="/#planos" className="hover:text-foreground transition">{t("footer.plans")}</a></li>
              <li><a href="/#beneficios" className="hover:text-foreground transition">{t("footer.benefits")}</a></li>
              <li><a href="/#faq" className="hover:text-foreground transition">{t("footer.faq")}</a></li>
              <li><Link to="/blog" className="hover:text-foreground transition">{t("footer.blog")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4">{t("footer.account")}</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><Link to="/login" className="hover:text-foreground transition">{t("footer.login")}</Link></li>
              <li><Link to="/signup" className="hover:text-foreground transition">{t("footer.signup")}</Link></li>
              <li><Link to="/dashboard" className="hover:text-foreground transition">{t("footer.dashboard")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4">{t("footer.legal")}</h4>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><Link to="/privacidade" className="hover:text-foreground transition">{t("footer.privacy")}</Link></li>
              <li><Link to="/termos" className="hover:text-foreground transition">{t("footer.terms")}</Link></li>
              <li><Link to="/reembolso" className="hover:text-foreground transition">{t("footer.refund")}</Link></li>
              <li>
                <a href={`mailto:${CONTACT.email}`} className="hover:text-foreground transition break-all">
                  {CONTACT.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} FastProxy. {t("footer.rights")}</p>
          <p>{t("footer.made_in")}</p>
        </div>
      </div>
    </footer>
  );
}
