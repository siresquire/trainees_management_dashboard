import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// In dev, allow the local Supabase Docker instance; in prod, only cloud endpoints.
const supabaseConnectSrc = isDev
  ? "https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321"
  : "https://*.supabase.co wss://*.supabase.co";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1 MB; Whizlabs CSV exports can reach ~3 MB due to verbose
      // multi-line "Validation Steps" fields, so raise to match our in-code limit.
      bodySizeLimit: "5mb",
    },
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              `connect-src 'self' ${supabaseConnectSrc}`,
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Server-only env vars are accessed via process.env directly in server components/actions.
  // NEXT_PUBLIC_ vars are the only ones exposed to the browser bundle.
  // Never reference SUPABASE_SERVICE_ROLE_KEY or ENCRYPTION_SECRET in client code.
};

export default nextConfig;
