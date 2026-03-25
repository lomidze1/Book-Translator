import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  sassOptions: {
    silenceDeprecations: ["legacy-js-api"],
  },
};

export default withNextIntl(nextConfig);
