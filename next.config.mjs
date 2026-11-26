/** @type {import('next').NextConfig} */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  // Pin tracing/output root to this project. Next sometimes infers the wrong
  // workspace root (e.g. a stray package-lock.json in the user's home folder),
  // which makes Watchpack scan the whole profile and dev requests hang.
  outputFileTracingRoot: __dirname,
  images: {
    unoptimized: true,
  },
  // Inlined at build time so the client can show which deployment it is
  // running. Vercel sets VERCEL_GIT_COMMIT_SHA during the build; locally it
  // falls back to "local".
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
  },
  // Pi requires the app to be embeddable by the Sandbox / Pi Browser. We send no
  // X-Frame-Options (default) and this only pins who may frame us. Because no
  // other directive is set, scripts, styles, images and connect-src stay
  // unrestricted — this cannot break the app, only block foreign framing.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.pinet.com https://*.minepi.com",
          },
        ],
      },
    ];
  },
}

export default nextConfig
