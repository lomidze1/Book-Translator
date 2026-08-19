import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
// Socket.IO connects to the same origin as the API over ws/wss.
const API_WS_URL = API_URL.replace(/^http/, "ws");

// Report-Only for now: Next.js emits inline bootstrap scripts and Google's GSI
// client pulls in its own frames, so we collect violation reports first and
// switch to enforcing once production traffic comes back clean.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // 'unsafe-inline'/'unsafe-eval' are required by Next.js' hydration bootstrap.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
  // Google Sign-In pulls its own stylesheet from accounts.google.com.
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https://books.google.com https://covers.openlibrary.org https://*.amazonaws.com https://lh3.googleusercontent.com",
  // next/font self-hosts, so no external font origin is needed.
  "font-src 'self' data:",
  // TTS audio is served from S3 presigned URLs.
  "media-src 'self' blob: https://*.amazonaws.com",
  `connect-src 'self' ${API_URL} ${API_WS_URL} https://accounts.google.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
  // Google Sign-In renders its button and consent flow in an iframe.
  "frame-src https://accounts.google.com",
  // Web Push service worker.
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // 'upgrade-insecure-requests' is intentionally absent: browsers ignore it in
  // a report-only policy and log an error for it on every page load. Add it
  // back when this switches to enforcing.
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  // HSTS only over HTTPS — sending it from a local http:// dev server would
  // pin localhost to https in the browser.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'books.google.com' },
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const config = withNextIntl(nextConfig);

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },
    })
  : config;
