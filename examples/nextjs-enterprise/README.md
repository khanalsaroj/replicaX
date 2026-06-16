# Next.js (enterprise)

A production Next.js setup: TypeScript, ESLint, Prettier, Jest, Husky + lint-staged + Commitlint, Docker, and GitHub Actions.

This is a ReplicaX **example profile**. It is generated from `source/` and serves as both
documentation and an integration test (see `tests/examples.test.ts`).

## Layout

- `source/` — the input project ReplicaX scanned (config + folder structure only).
- `.replicax/` — the generated profile (run `replicax inspect --profile ./.replicax`).
- `expected/report.txt` — the detected setup, as a stable snapshot.

## Usage

Scaffold a brand-new project from this profile:

```bash
replicax create my-app --profile ./examples/nextjs-enterprise/.replicax
```

Inspect or audit it:

```bash
replicax inspect --profile ./examples/nextjs-enterprise/.replicax
replicax audit --profile ./examples/nextjs-enterprise/.replicax
```

> Regenerate the profile + report after changing `source/` with:
> `UPDATE_EXAMPLES=1 npx vitest run tests/examples.test.ts`
