"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface OddsHunterMascotProps {
  /**
   * Optional path to the real detoured mascot artwork (PNG/WebP), e.g.
   * `/mascot/odds-hunter.webp` once dropped into `public/mascot/`. Falls
   * back to a CSS/SVG silhouette placeholder when omitted.
   */
  src?: string;
  variant?: "full" | "compact";
  className?: string;
  /** Disable the mouse-parallax tilt (e.g. inside a small header slot). */
  parallax?: boolean;
}

/**
 * The Odds Hunter mascot. Deliberately subtle — a hooded, silhouetted
 * figure with glowing amber eyes, floating gently with light mouse
 * parallax. No cartoon bounce, no gaming-style animation. Swap `src` for
 * the real asset when it's exported; swap the whole render for a
 * react-three-fiber scene later without touching call sites.
 */
export function OddsHunterMascot({ src, variant = "full", className, parallax = true }: OddsHunterMascotProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 80, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 80, damping: 20 });
  const rotateY = useTransform(springX, [-0.5, 0.5], [-4, 4]);
  const rotateX = useTransform(springY, [-0.5, 0.5], [4, -4]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!parallax || prefersReducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handlePointerLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const dimensions = variant === "compact" ? { width: 96, height: 118 } : { width: 200, height: 246 };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn("relative select-none", className)}
      style={{ width: dimensions.width, height: dimensions.height, perspective: 600 }}
      aria-hidden="true"
    >
      <motion.div
        style={
          prefersReducedMotion
            ? undefined
            : { rotateX, rotateY, transformStyle: "preserve-3d" }
        }
        animate={prefersReducedMotion ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative h-full w-full"
      >
        {src ? (
          <Image src={src} alt="" fill className="object-contain drop-shadow-[0_0_28px_rgba(245,184,0,0.18)]" />
        ) : (
          <MascotPlaceholder />
        )}
      </motion.div>
    </div>
  );
}

function MascotPlaceholder() {
  return (
    <svg viewBox="0 0 200 246" className="h-full w-full overflow-visible">
      <defs>
        <radialGradient id="mascot-ambient" cx="50%" cy="38%" r="55%">
          <stop offset="0%" stopColor="#f5b800" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#f5b800" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mascot-fabric" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#141416" />
          <stop offset="100%" stopColor="#020202" />
        </linearGradient>
        <filter id="mascot-eye-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="100" cy="95" rx="95" ry="95" fill="url(#mascot-ambient)" />

      {/* shoulders / hoodie body */}
      <path
        d="M32 246 C32 178 55 150 100 150 C145 150 168 178 168 246 Z"
        fill="url(#mascot-fabric)"
        stroke="#232326"
        strokeWidth="1"
      />

      {/* hood */}
      <path
        d="M100 8 C56 8 34 44 34 82 C34 112 46 132 66 146 C58 118 60 84 100 84 C140 84 142 118 134 146 C154 132 166 112 166 82 C166 44 144 8 100 8 Z"
        fill="url(#mascot-fabric)"
        stroke="#232326"
        strokeWidth="1"
      />

      {/* face shadow */}
      <ellipse cx="100" cy="100" rx="40" ry="34" fill="#020202" />

      {/* glowing eyes */}
      <g filter="url(#mascot-eye-glow)">
        <ellipse cx="84" cy="100" rx="7" ry="3.4" fill="#f5b800" />
        <ellipse cx="116" cy="100" rx="7" ry="3.4" fill="#f5b800" />
      </g>

      {/* brand mark on chest */}
      <g transform="translate(90,190)" opacity="0.9">
        <circle cx="10" cy="10" r="9" stroke="#f5b800" strokeWidth="1.2" fill="none" />
        <circle cx="10" cy="10" r="1.6" fill="#f5b800" />
      </g>
    </svg>
  );
}
