import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { whatsappUrl } from "@/config/contact";

export function WhatsAppFloat() {
  const [visible, setVisible] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    // Mostra após 1 minuto que o cliente ficou no site
    const t = setTimeout(() => setVisible(true), 60000);
    // Mostra balãozinho uma vez por sessão logo após aparecer
    const t2 = setTimeout(() => {
      if (!sessionStorage.getItem("wa-tip-shown")) {
        setShowTip(true);
        sessionStorage.setItem("wa-tip-shown", "1");
        setTimeout(() => setShowTip(false), 6000);
      }
    }, 62000);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            className="relative max-w-[230px] rounded-2xl bg-card border border-border shadow-xl px-3.5 py-2.5 text-xs text-foreground"
          >
            <button
              onClick={() => setShowTip(false)}
              aria-label="Fechar"
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-110 transition"
            >
              <X className="w-3 h-3" />
            </button>
            Tá com dúvida sobre qual plano escolher? Fala com a gente no WhatsApp 👋
          </motion.div>
        )}
      </AnimatePresence>

      <motion.a
        href={whatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="relative w-14 h-14 rounded-full bg-[#25D366] text-white shadow-[0_8px_28px_-6px_rgba(37,211,102,0.6)] flex items-center justify-center"
      >
        <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-30" />
        <MessageCircle className="w-7 h-7 relative" strokeWidth={2.2} fill="currentColor" />
      </motion.a>
    </div>
  );
}
