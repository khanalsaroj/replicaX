# Security Policy

ReplicaX is built around a simple promise: **it captures a project's setup, never
its source or its secrets.** Security is a core feature, not an afterthought.

## Supported versions

ReplicaX is pre-1.0 and ships fixes on the latest published version. Always run
the newest release (`npm install -g @iamsaroj/replicax@latest`).

| Version | Supported |
|---------|-----------|
| latest  | ✅         |
| older   | ❌         |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

- Preferred: open a [private security advisory](https://github.com/khanalsaroj/replicaX/security/advisories/new)
  on GitHub.
- Or email **imsaroj@g.skku.edu** with the details.

Include reproduction steps, affected version, and impact. You'll get an
acknowledgement within a few days, and we'll coordinate a fix and disclosure
timeline with you. Please give us a reasonable window to release a fix before
any public disclosure.

## What ReplicaX guarantees

These are enforced in code and covered by tests:

- **Secrets are never captured.** `.env`, `.env.*`, `*.pem`, `*.key`, `*.crt`,
  SSH keys, and similar are blocked unconditionally by the secret guard
  (`SECRET_GUARD_GLOBS`); ignore configuration cannot override it. `.npmrc` is
  captured only after auth tokens are stripped.
- **No business source is captured.** Only configuration files and the (empty)
  folder hierarchy enter a profile. Application source is never read into one.
- **Config files are never executed.** They are copied as raw bytes - there is
  no config evaluator, so capturing a `.ts`/`.js` config cannot run code.
- **No path escapes.** Every path coming out of a profile or an AI response is
  validated against traversal (`..`) and absolute paths (`safeJoinable`) before
  anything is written. `validate` re-checks this.
- **Archive extraction is a trust boundary.** An imported `.tar.gz` is validated
  before any byte is written: entries that escape the target, symlinks/hardlinks,
  and device entries are rejected, and the archive is capped on compressed size,
  uncompressed size, file count, and per-file size (tar-bomb protection). The
  same guard protects the GitHub tarball fetched by `extract`.
- **Dependency install is opt-in for untrusted profiles.** Because installing
  runs package lifecycle scripts, `create` will not auto-install for a profile
  obtained via `extract` or `import`; it prints the dependency list and waits for
  an explicit `--install`.
- **Credentials are never stored.** A `GITHUB_TOKEN`/`GH_TOKEN` or provider API
  key is read from the environment for a single request and never persisted.

## Supply-chain practices

- Dependencies and GitHub Actions are kept patched by **Dependabot**
  (`.github/dependabot.yml`).
- CI gates on `npm audit --omit=dev --audit-level=high` for the dependency tree
  that actually ships in `dist/`.
- **GitHub Actions pinning policy:** actions are referenced by major-version tag
  (e.g. `actions/checkout@v4`) and kept current by Dependabot, rather than
  hand-pinned to commit SHAs. This is a deliberate trade-off favoring automatic
  security updates; revisit if the threat model changes.
- Releases are published with **npm provenance** when the repository is public.
