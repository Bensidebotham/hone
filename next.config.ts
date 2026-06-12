import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the tracing root to this project. Without it, Next walks up and picks
  // the home-directory lockfile (~/package-lock.json) as the workspace root,
  // which breaks output file tracing on Vercel.
  outputFileTracingRoot: import.meta.dirname,

  // Baseline security headers applied to every response.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
