import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const imageHosts = [...new Set([process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].flatMap(value => {
  try { const url = new URL(value); return url.protocol === "https:" ? [url.hostname] : []; } catch { return []; }
}))];
const config = {
  images: { remotePatterns: imageHosts.map(hostname => ({ protocol: "https", hostname, pathname: "/storage/v1/object/public/**" })) },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ] },
      { source: "/app/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/expenses/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      ...["/app/:path*", "/dashboard/:path*", "/pos/:path*", "/menu/:path*", "/expenses/:path*", "/libraries/:path*", "/sign-in", "/forgot-password", "/reset-password", "/auth/:path*", "/api/:path*"].map(source => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
    ];
  },
};
// Development must not load files overwritten by a production build/start.
const configuredBuild = (phase) => ({
  ...config,
  distDir: phase === PHASE_DEVELOPMENT_SERVER
    ? ".next-dev"
    : ".next",
});
export default configuredBuild;
