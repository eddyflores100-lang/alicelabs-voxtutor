import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone solo para el runner local (bun); en Vercel el builder propio no lo admite
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  reactStrictMode: false,
};

export default nextConfig;
