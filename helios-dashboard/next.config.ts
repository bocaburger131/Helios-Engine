import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const HELIOS_API_ORIGIN =
  process.env.HELIOS_API_REWRITE_ORIGIN?.replace(/\/$/, "") ||
  "http://localhost:3000";

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${HELIOS_API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
