import { defineConfig } from "vite";

// Static landing page (site/), built with `npm run site:build` into site-dist/.
export default defineConfig({
  root: "site",
  base: "./",
  publicDir: "../docs/media",
  build: { outDir: "../site-dist", emptyOutDir: true },
});
