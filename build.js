import * as esbuild from "esbuild";
import { glob } from "glob";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  const commonConfig = {
    platform: "node",
    format: "esm",
    outdir: "dist",
  };

  // 编译 RSS 相关文件
  await esbuild.build({
    ...commonConfig,
    entryPoints: [
      "rss.js",
      ...(await glob("rss/**/*.{js,ts}")),
      ...(await glob("utils/**/*.{js,ts}")),
    ],
  });

  // 打包主程序
  await esbuild.build({
    ...commonConfig,
    alias: {
      "@": __dirname,
    },
    entryPoints: ["index.js"],
    bundle: true,
    external: ["./rss.js", "./rss/*", "./node_modules/*"],
  });
}

build().catch(() => process.exit(1));
