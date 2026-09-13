import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        soundlab: fileURLToPath(new URL("./soundlab.html", import.meta.url)),
        hostcards: fileURLToPath(new URL("./hostcards.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
