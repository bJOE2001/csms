import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const config = {
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ] },
      { source: "/app/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
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
