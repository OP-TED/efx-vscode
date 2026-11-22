// Builds the extension with esbuild: src/extension.ts and everything it imports, bundled into one
// CommonJS file, dist/extension.js, which VS Code loads (package.json "main"). The vscode module is
// left out: VS Code provides it. The build writes a source map beside it, for debugging, except with
// --production, the build the .vsix holds. With --tests, it builds the tests instead: each
// test/*.test.ts bundled on its own into out/test/, where npm test runs them inside VS Code
// (.vscode-test.mjs). The output folder is made anew each time.

import fs from 'node:fs';
import * as esbuild from 'esbuild';

const options = process.argv.slice(2);

const COMMON = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode'],
  logLevel: 'info',
};

const EXTENSION = {
  ...COMMON,
  entryPoints: ['src/extension.ts'],
  outdir: 'dist',
  sourcemap: !options.includes('--production'),
};

const TESTS = {
  ...COMMON,
  entryPoints: ['test/*.test.ts'],
  outdir: 'out/test',
};

const build = options.includes('--tests') ? TESTS : EXTENSION;
fs.rmSync(build.outdir, { recursive: true, force: true });
await esbuild.build(build);
