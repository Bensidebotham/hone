import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the tracing root to this project. Without it, Next walks up and picks
  // the home-directory lockfile (~/package-lock.json) as the workspace root,
  // which breaks output file tracing on Vercel.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
