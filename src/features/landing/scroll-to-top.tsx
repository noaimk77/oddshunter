"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed right-5 bottom-5 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-background/80 text-gold shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:bg-gold/10"
          aria-label="Retour en haut"
        >
          <ArrowUp className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
