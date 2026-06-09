"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();

  // Opacity-only fade: avoids holding a CSS transform on the wrapper, which
  // would create a stacking context that can interfere with the dnd-kit kanban
  // drag during the brief post-navigation animation window.
  const initial = prefersReduced ? { opacity: 1 } : { opacity: 0 };
  const animate = { opacity: 1 };

  return (
    <motion.div
      key={pathname}
      initial={initial}
      animate={animate}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
