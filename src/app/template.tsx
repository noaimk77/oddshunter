"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * Next.js re-mounts `template.tsx` on every navigation (unlike layout.tsx,
 * which persists) — that's what makes a per-page enter transition possible
 * here. Plain `initial`/`animate` on mount, no viewport/scroll dependency,
 * so it always completes regardless of where the user lands on the page.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
