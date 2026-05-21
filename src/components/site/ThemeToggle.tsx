import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? t("common.theme_light") : t("common.theme_dark")}
      className={`p-2 rounded-full hover:bg-foreground/10 transition text-foreground ${className}`}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
