// Builds the extension with esbuild: src/extension.ts and everything it imports, the EFX highlighter
// included, bundled into one CommonJS file, dist/extension.js, which VS Code loads (package.json
// "main"), and so src/worker.ts into dist/worker.js, which the extension starts as its worker
// thread. The vscode module is left out: VS Code provides it. The TextMate grammars of the
// highlighter are copied beside it (package.json "grammars"). The build writes a source map, for
// debugging, except with --production, the build the .vsix holds. With --tests, it builds the
// tests instead: each test/*.test.ts bundled on its own into out/test/, where npm test runs them
// inside VS Code (.vscode-test.mjs). The output folder is made anew each time.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as esbuild from 'esbuild';

const options = process.argv.slice(2);
const require = createRequire(import.meta.url);

const COMMON = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode'],
  logLevel: 'info',
};

const EXTENSION = {
  esbuild: {
    ...COMMON,
    entryPoints: ['src/extension.ts', 'src/worker.ts'],
    outdir: 'dist',
    sourcemap: !options.includes('--production'),
  },
  copies: ['efx2.tmLanguage.json', 'efx1.tmLanguage.json']
    .map((grammar) => ({ from: require.resolve(`@op-ted/efx-syntax-highlighter/${grammar}`), to: `dist/${grammar}` })),
};

const TESTS = {
  esbuild: {
    ...COMMON,
    entryPoints: ['test/*.test.ts'],
    outdir: 'out/test',
  },
  copies: [],
};

const build = options.includes('--tests') ? TESTS : EXTENSION;
fs.rmSync(build.esbuild.outdir, { recursive: true, force: true });
await esbuild.build(build.esbuild);
for (const { from, to } of build.copies) {
  fs.copyFileSync(from, to);
  console.log(`  ${to} copied from ${path.relative('.', from)}`);
}
