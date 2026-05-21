import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import logo from "@/assets/logo-fastproxy.png";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-card/30 mt-10">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-5 gap-10 mb-12">
          <div className="md:col-span-2">
            <img src={logo} alt="FastProxy" className="h-10 mb-4" />
            <p className="text-muted-foreground max-w-md leading-relaxed">
              {t("footer.tagline")}
            </p>
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
