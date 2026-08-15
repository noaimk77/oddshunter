"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(dashboard)/account/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" size="sm" className="gap-1.5">
        <LogOut className="h-3.5 w-3.5" />
        Log out
      </Button>
    </form>
  );
}
