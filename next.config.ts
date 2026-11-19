import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load @react-pdf/renderer as a real Node module in server routes rather than
  // bundling it (bundling breaks its internals → "reading 'S'" at renderToBuffer).
  // @prisma/client + .prisma/client: required by OpenNext on Cloudflare so it can
  // patch the generated client. worker-mailer: Cloudflare-only (cloudflare:sockets),
  // never bundled for Node.
  serverExternalPackages: ['@react-pdf/renderer', '@prisma/client', '.prisma/client', 'worker-mailer'],

  // Cloudflare has no built-in Next image optimizer without an Images binding;
  // Domio has a single next/image use, so serve images as-is everywhere.
  images: { unoptimized: true },

  // Skip type-checking during the Vercel build — types are verified separately
  // via `npm run typecheck` (tsc --noEmit). Avoids the build stalling/failing in
  // the "Running TypeScript..." step. (Next 16 no longer runs ESLint during
  // `next build`, so no `eslint` config key is needed — it was removed in v16.)
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
