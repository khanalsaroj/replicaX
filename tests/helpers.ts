import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';

/** Create an isolated temp directory for a test; returns its absolute path. */
export async function makeTempDir(prefix = 'replicax-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** Write a map of relative path → contents into `root`, creating parents. */
export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.ensureDir(path.dirname(full));
    await fs.writeFile(full, content, 'utf8');
  }
}

/**
 * A representative project fixture: real config files, business source (whose
 * contents must never be captured), a secret, and prunable directories.
 */
export async function scaffoldSampleProject(root: string): Promise<void> {
  await writeFiles(root, {
    'package.json': JSON.stringify({
      name: 'sample',
      version: '9.9.9',
      type: 'module',
      packageManager: 'pnpm@9.0.0',
      engines: { node: '>=20' },
      scripts: { build: 'tsc', test: 'vitest' },
      dependencies: { react: '^18.0.0' },
      devDependencies: { typescript: '^5.5.0', vitest: '^1.6.0' },
      'lint-staged': { '*.ts': 'eslint --fix' },
    }),
    'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
    'vite.config.ts': 'export default {};\n',
    '.prettierrc': '{ "semi": true }\n',
    'eslint.config.js': 'export default [];\n',
    Dockerfile: 'FROM node:20-alpine\n',
    '.github/workflows/ci.yml': 'name: CI\n',
    '.husky/pre-commit': 'npx lint-staged\n',
    '.nvmrc': '20.11.0\n',
    '.npmrc': 'save-exact=true\n//registry.npmjs.org/:_authToken=SECRET123\n',
    '.env': 'API_KEY=do-not-leak\n',
    'private.pem': '-----BEGIN PRIVATE KEY-----\n',
    'src/components/Button.tsx': 'export const Button = () => null;\n',
    'src/services/UserService.ts': 'export class UserService {}\n',
    'node_modules/junk/index.js': 'module.exports = 1;\n',
    'dist/out.js': 'console.log(1);\n',
  });
}
