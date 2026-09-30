import next from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const config = [
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"] },
  ...next,
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
];
export default config;
