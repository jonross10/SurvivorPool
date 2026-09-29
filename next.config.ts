import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't bundle these — bundling `ws` breaks its frame-masking (buffer-util), which
  // made Better Auth's Neon WebSocket Pool throw "b.mask is not a function" on Vercel.
  // Leaving them external lets their runtime/native bits load correctly.
  serverExternalPackages: ["ws", "@neondatabase/serverless"],
};

export default nextConfig;
