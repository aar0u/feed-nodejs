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
    packages: "external",
    external: ["./rss.js", "./rss/*"],
  });

  // Copy and modify package.json
  const fs = await import("fs/promises");
  const pkg = JSON.parse(await fs.readFile("package.json", "utf-8"));

  // Update scripts for production
  pkg.scripts = {
    start: "node index.js"
  };
  // Remove devDependencies
  delete pkg.devDependencies;

  await fs.writeFile("dist/package.json", JSON.stringify(pkg, null, 2));

  // Copy package-lock.json if exists
  try {
    await fs.copyFile("package-lock.json", "dist/package-lock.json");
  } catch (e) {
    // ignore if not exists
  }

  // Copy assets (views and public)
  const assets = [
    ...(await glob("views/**/*", { nodir: true })),
    ...(await glob("public/**/*", { nodir: true }))
  ];

  for (const asset of assets) {
    const dest = `dist/${asset}`;
    await fs.mkdir(dirname(dest), { recursive: true });
    await fs.copyFile(asset, dest);
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
