import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withPWAInit from "@ducanh2912/next-pwa";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
});

const nextConfig: NextConfig = {
  transpilePackages: ["@raah/ui", "@raah/shared", "@raah/db"],
  async headers() {
    return [
      {
        source: "/inspiration/:slug*",
        headers: [
          {
            key: "Cache-Control",
            value: "s-maxage=86400, stale-while-revalidate=3600",
          },
        ],
      },
    ];
  },
};

export default withPWA(withNextIntl(nextConfig));
