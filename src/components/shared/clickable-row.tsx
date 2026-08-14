"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function ClickableRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <TableRow
      onClick={() => router.push(href)}
      className={cn("cursor-pointer transition-colors hover:bg-secondary/50", className)}
    >
      {children}
    </TableRow>
  );
}
