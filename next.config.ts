import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  async rewrites() {
    return [
      { source: "/voice", destination: "/" },
      { source: "/notes", destination: "/" },
      { source: "/pulse", destination: "/" },
      { source: "/chat", destination: "/" },
      { source: "/templates", destination: "/" },
      { source: "/review", destination: "/" },
      { source: "/settings", destination: "/" },
    ];
  },
};

export default nextConfig;
