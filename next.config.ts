import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The project isn't its own git repo root at /Users/noaimkouakou, so
  // Turbopack can't infer the workspace root from a lockfile — pin it
  // explicitly rather than let it guess and pick up a package-lock.json
  // outside this directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
