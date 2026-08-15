"use client";

import { DataStatusIndicator } from "@/components/shared/data-status-indicator";
import { Wordmark } from "@/components/shared/wordmark";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav-items";
import { SidebarNav } from "./sidebar-nav";

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-6">
        <Wordmark />
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <SidebarNav items={PRIMARY_NAV} onNavigate={onNavigate} />
      </div>

      <div className="mt-auto px-3 pb-4">
        <div className="mb-3 border-t border-border/70 pt-3">
          <SidebarNav items={SECONDARY_NAV} onNavigate={onNavigate} />
        </div>
        <DataStatusIndicator status="demo" />
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
