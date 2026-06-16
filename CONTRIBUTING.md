# Contributing to ReplicaX

Thanks for your interest in improving ReplicaX! This guide covers the local
workflow, the project's conventions, and how to get a change merged.

## Prerequisites

- **Node.js 20+** (the `engines` floor; CI runs on 20 and 22).
- **npm 10** for the lockfile (see the note below).

## Getting started

```bash
git clone https://github.com/khanalsaroj/replicaX.git
cd replicaX
npm install
npm run build
```

## The development loop

| Command               | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `npm run build`       | Bundle to `dist/index.js` (single ESM file) with tsup   |
| `npm run dev`         | Rebuild on change (`tsup --watch`)                      |
| `npm run typecheck`   | `tsc --noEmit` over **src and tests**                   |
| `npm run lint`        | ESLint over `src` and `tests`                           |
| `npm test`            | Run the Vitest suite once                               |
| `npm run test:watch`  | Watch mode                                              |
| `npm run format`      | Prettier write                                          |
| `npm run format:check`| Prettier check (CI gate)                                |

Run a single test file or by name:

```bash
npx vitest run tests/scanner.test.ts
npx vitest run -t "sanitizes a captured .npmrc"
```

Before opening a PR, make sure the full gate passes locally:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

## Conventions that matter

These are load-bearing - a change that violates one will be sent back:

- **`@/*` path alias.** Imports use `@/*` -> `src/*`, extensionless
  (e.g. `import { logger } from '@/utils/logger'`). Same-directory test imports
  stay relative.
- **The profile schema is additive-only.** `src/schema.ts` is the single source
  of truth; every type is `z.infer`-ed from a zod schema. New fields must be
  `.optional()` and paired with a migration step in `src/core/migrations.ts` -
  never make a breaking schema change.
- **The secret guard is sacred.** `SECRET_GUARD_GLOBS` in `src/constants.ts` is
  unconditional and cannot be overridden by ignore config. Never weaken it, and
  never add a path that lets a profile capture `.env`, keys, or certs.
- **Config files are copied verbatim, never executed.** Do not introduce
  `jiti`/`c12` or any config executor - both `.ts` and `.js` variants must work
  without compilation.
- **Every profile path is validated.** Anything read from a profile or an AI
  response goes through `safeJoinable()` before being written.
- **stdout vs stderr.** Diagnostics go to stderr (`logger.*`); only
  machine-readable results go to stdout (`logger.out()`), so `--json` stays
  pipeable.

### Adding things

- **A new config file to capture:** add a glob to the right category in
  `src/config/supported-files.ts`. That is the only place the scanner consults.
- **A new detector:** add one array entry under `src/core/detection/detectors/`
  and register it in `registry.ts`.
- **A new AI assistant target:** add a catalogue entry in
  `src/config/ai-targets.ts`.

See [CLAUDE.md](CLAUDE.md) for the full architecture tour.

## Tests

Tests use **real temp directories** (`os.tmpdir`), not mocks - see
`tests/helpers.ts`. New behavior needs a test. Security-relevant changes
(archive handling, path safety, the secret guard) need a test that proves the
boundary holds.

## Commits & pull requests

- Branch off `main`; keep PRs focused.
- Write a clear description of **what** changed and **why**. Link any related
  issue.
- Make sure the gate above passes; CI runs the same checks on Node 20 and 22.
- If you changed user-facing behavior, update the `README.md` and add a
  `CHANGELOG.md` entry under `## [Unreleased]`.

## Lockfile note

`package-lock.json` is maintained with **npm 10** (what CI's Node 20/22 ship
with). On npm 11+, regenerate with `npx npm@10 install` when changing
dependencies - npm 11 resolves a different tree and desyncs `npm ci`.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
