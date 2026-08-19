import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/mentions-legales",
  "/1xbet",
  "/bookmakers",
  "/abonnement",
  "/reseaux",
  "/faq",
]);
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/stripe/webhook"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.includes(".")
  ) {
    return;
  }

  // Keep the global route check Edge-compatible. Importing the full Auth.js
  // configuration here also imports Prisma and node-postgres, which cannot run
  // in Netlify's Edge middleware. Sensitive pages and APIs still perform their
  // full server-side database checks through requireAuth().
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: req.nextUrl.protocol === "https:",
  });

  if (!token) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  // Every route except static assets goes through the check above; API
  // routes are covered too (they're where real enforcement matters — see
  // lib/guards.ts for the request-level requireAuth/requireEntitlement
  // checks each sensitive route handler also performs).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
