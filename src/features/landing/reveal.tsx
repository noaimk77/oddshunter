"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-reveal, rebuilt after a `whileInView`/framer-motion version was
 * found (in testing) to occasionally leave sections stuck at partial
 * opacity — content on a sales page must never risk staying invisible.
 * This version fixes that at the root: a plain CSS transition driven by
 * React state, and that state is guaranteed to flip to visible either via
 * IntersectionObserver OR a hard fallback timer — whichever fires first.
 * Worst case (observer never fires, JS is slow, whatever), the section
 * still reveals itself well within a second. Best case, it reveals right
 * as it scrolls into view.
 */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reveal = () => setVisible(true);
    const fallback = window.setTimeout(reveal, 900);

    if (!("IntersectionObserver" in window)) {
      reveal();
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal();
          window.clearTimeout(fallback);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}s` : "0s" }}
      className={cn(
        "transition-all duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
