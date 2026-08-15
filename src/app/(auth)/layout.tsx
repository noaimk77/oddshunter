import type { ReactNode } from "react";
import { Wordmark } from "@/components/shared/wordmark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
