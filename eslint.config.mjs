import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "drizzle/**", "next-env.d.ts"]),
  {
    // Product photos come from Supabase Storage / user uploads with unknown
    // dimensions, so plain <img> is intentional throughout the storefront.
    files: [
      "app/**/*.tsx",
      "components/store/**/*.tsx",
      "components/shop/**/*.tsx",
      "components/dashboard/**/*.tsx",
    ],
    rules: { "@next/next/no-img-element": "off" },
  },
]);

export default eslintConfig;
