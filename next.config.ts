import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Back/forward navigations re-fetch the RSC payload from the server on
    // every press with the default (0s) dynamic stale time. These pages are
    // dynamic (session + remote DB), so back felt like a full slow reload.
    // Keep page segments in the client Router Cache briefly so back/forward
    // paints instantly from cache while the server revalidates in background.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
