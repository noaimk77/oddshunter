import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileTopbar } from "./mobile-topbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileTopbar />
      <main className="md:pl-60">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
