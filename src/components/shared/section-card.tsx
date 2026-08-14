import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border/70 bg-card/40", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
          <div>
            {title && (
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            )}
            {description && <p className="mt-0.5 text-sm text-foreground/90">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
