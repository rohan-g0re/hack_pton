import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Next picks the repo-root lockfile and mis-resolves packages; lock dev server to this app.
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
