import type { NextConfig } from "next";

// GitHub Pages serves only static files. Keep the server/API routes available for
// deployments with PostgreSQL, but exclude them from the separate Pages build.
const staticExport = process.env.FORMA_STATIC_EXPORT === "1";
const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      pageExtensions: ["static.tsx", "static.ts"],
      basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
