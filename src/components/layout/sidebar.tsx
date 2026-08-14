"use client";

import { Radar } from "lucide-react";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/25">
          <Radar className="h-4.5 w-4.5" strokeWidth={2.25} />
        </div>
        <span className="font-mono text-[15px] font-semibold tracking-[0.12em] text-foreground">
          ODDSCOPE
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <SidebarNav items={PRIMARY_NAV} onNavigate={onNavigate} />
      </div>

      <div className="mt-auto px-3 pb-4">
        <div className="mb-3 border-t border-border/70 pt-3">
          <SidebarNav items={SECONDARY_NAV} onNavigate={onNavigate} />
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">Live Data</span>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border/70 bg-sidebar md:flex">
      <SidebarContent />
    </aside>
  );
}
