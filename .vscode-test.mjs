// The tests run against the extension as people install it: the .vsix that npm run package writes,
// installed in a VS Code of their own, which npm test downloads into .vscode-test/. VS Code runs tests
// only beside an extension in development mode; test/host is an empty one, so that the extension
// under test is the installed one, not this folder. The tests run in the oldest VS Code that the
// extension supports, the version that package.json "engines" gives, and in the latest.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@vscode/test-cli';

// VS Code installs the .vsix into .vscode-test/extensions/, where it keeps a newer version installed
// by an earlier run rather than go back to an older one: each run starts with no extension installed.
fs.rmSync(new URL('.vscode-test/extensions/', import.meta.url), { recursive: true, force: true });

const manifest = JSON.parse(fs.readFileSync(new URL('package.json', import.meta.url), 'utf8'));
const vsix = fileURLToPath(new URL(`${manifest.name}-${manifest.version}.vsix`, import.meta.url));
const [, oldest] = /^\^(\d+\.\d+\.\d+)$/.exec(manifest.engines.vscode) ?? [];
if (!oldest) {
  throw new Error(`package.json "engines" must give VS Code as ^x.y.z, not ${manifest.engines.vscode}`);
}

export default defineConfig(
  [oldest, 'stable'].map((version) => ({
    label: version,
    version,
    installExtensions: [vsix],
    extensionDevelopmentPath: 'test/host',
    workspaceFolder: 'test/workspace',
    files: 'out/test/*.test.js',
    mocha: { ui: 'tdd', timeout: 20000 },
  })),
);
