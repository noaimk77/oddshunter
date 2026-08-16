import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The project isn't its own git repo root at /Users/noaimkouakou, so
  // Turbopack can't infer the workspace root from a lockfile — pin it
  // explicitly rather than let it guess and pick up a package-lock.json
  // outside this directory.
  turbopack: {
    root: path.join(__dirname),
  },
  // The AgentMail SDK's client statically imports the optional `@x402/fetch`
  // payment-protocol package (a feature this app never uses) — Turbopack
  // tries to resolve it at bundle time and fails since it isn't installed.
  // Excluding the package from Server Components bundling makes Next use
  // native Node `require` instead, which only resolves that import if the
  // unused code path actually runs.
  serverExternalPackages: ["agentmail"],
};

export default nextConfig;
