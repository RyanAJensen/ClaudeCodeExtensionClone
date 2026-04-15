// @ts-check
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
  logLevel: 'info',
};

async function copyWebviewAssets() {
  const webviewDist = path.join(__dirname, 'dist', 'webview');
  if (!fs.existsSync(webviewDist)) {
    fs.mkdirSync(webviewDist, { recursive: true });
  }
  const assets = ['webview/styles.css', 'webview/main.js'];
  for (const asset of assets) {
    const src = path.join(__dirname, asset);
    const dest = path.join(__dirname, 'dist', asset);
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${asset} → dist/${asset}`);
    }
  }
}

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(extensionConfig);
    await ctx.watch();
    console.log('Watching for changes...');
    // Also watch webview assets and copy on change
    fs.watch('webview', { recursive: true }, () => {
      copyWebviewAssets().catch(console.error);
    });
  } else {
    await esbuild.build(extensionConfig);
  }
  await copyWebviewAssets();
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
