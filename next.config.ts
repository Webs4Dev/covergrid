import type { NextConfig } from "next";

// Page caching (cacheComponents) is left off on purpose: a roster must always
// show the current data, so every page reads from the database on each request.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
