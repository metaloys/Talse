/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Inlined at build time so the client can show which deployment it is
  // running. Vercel sets VERCEL_GIT_COMMIT_SHA during the build; locally it
  // falls back to "local".
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
  },
}

export default nextConfig
