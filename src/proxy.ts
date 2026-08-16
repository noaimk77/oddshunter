import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/forgot-password", "/reset-password", "/mentions-legales"]);
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/stripe/webhook"];

/**
 * Next.js 16 renamed `middleware` to `proxy` — and crucially, `proxy`
 * always runs in the Node.js runtime (never Edge), which is what makes the
 * Prisma + node-postgres (`pg`) driver adapter usable here at all (it opens
 * real TCP sockets, which the Edge runtime doesn't support).
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return;
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // Every route except static assets goes through the check above; API
  // routes are covered too (they're where real enforcement matters — see
  // lib/guards.ts for the request-level requireAuth/requireEntitlement
  // checks each sensitive route handler also performs).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
