import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// `pnpm e2e:server` sets CLUBS_E2E so the E2E suite runs against its own local
// state: a test run never touches (or depends on) the dev database.
const isE2e = process.env.CLUBS_E2E === "1";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      persistState: isE2e ? { path: ".wrangler/e2e" } : true,
    }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
