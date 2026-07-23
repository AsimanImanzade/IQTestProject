import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` is required in style-src because Tailwind-driven inline styles and the
 * next-themes flash-prevention script both emit inline style attributes. Scripts are NOT given
 * 'unsafe-inline' in production.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Inline SVG for questions is rendered from our own generated markup, never remote.
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // @node-rs/argon2 is a native addon; bundling it breaks the standalone server build.
  serverExternalPackages: ["@node-rs/argon2"],

  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
