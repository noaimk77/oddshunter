"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
  animateOnMount?: boolean;
}

export function AnimatedNumber({
  value,
  format = (v) => v.toLocaleString("en-US"),
  duration = 0.8,
  className,
  animateOnMount = false,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(animateOnMount ? 0 : value);
  const prevValue = useRef(animateOnMount ? 0 : value);

  useEffect(() => {
    const controls = animate(prevValue.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prevValue.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
