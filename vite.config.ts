import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // GitHub Pages 網址是 https://cosmos0409-yen.github.io/GuessActivity/，不在網域根目錄。
  // 只有在 GitHub Actions 打包時加前綴；本機 npm run dev 維持 localhost:5173/，已存的設定不受影響。
  base: process.env.GITHUB_ACTIONS === "true" ? "/GuessActivity/" : "/",
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
