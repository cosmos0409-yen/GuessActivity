// 把決賽的合成音效（../src/audio/SoundManager.ts）打包成選拔賽主持人頁用的 public/shared/sound.js。
// 兩套系統共用同一份音效原始碼；改了 SoundManager.ts 之後在 live-quiz/ 底下重跑：
//   node tools/build-sound.mjs
// 用的是根目錄 node_modules 裡的 esbuild（決賽的 Vite 會一起裝），不另外安裝套件。
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("../../node_modules/esbuild");
const root = fileURLToPath(new URL("../..", import.meta.url));

await esbuild.build({
  entryPoints: [`${root}src/audio/SoundManager.ts`],
  outfile: `${root}live-quiz/public/shared/sound.js`,
  bundle: true,
  format: "esm",
  target: "es2020",
  // 決賽用 Vite 的 import.meta.env.BASE_URL 找 public/sfx/；選拔賽的 public/ 就在網站根目錄
  define: { "import.meta.env.BASE_URL": '"/"' },
  banner: {
    js: "// ⚠️ 自動產生，請勿手改：來源是 src/audio/SoundManager.ts，重新產生請在 live-quiz/ 執行 node tools/build-sound.mjs",
  },
  legalComments: "none",
});
console.log("已產生 live-quiz/public/shared/sound.js");
