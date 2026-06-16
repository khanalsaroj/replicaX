# Spring Boot (Maven)

A Spring Boot service built with Maven: application config, the Maven wrapper, Docker, and GitHub Actions. Demonstrates ReplicaX capturing a non-Node stack.

This is a ReplicaX **example profile**. It is generated from `source/` and serves as both
documentation and an integration test (see `tests/examples.test.ts`).

## Layout

- `source/` — the input project ReplicaX scanned (config + folder structure only).
- `.replicax/` — the generated profile (run `replicax inspect --profile ./.replicax`).
- `expected/report.txt` — the detected setup, as a stable snapshot.

## Usage

Scaffold a brand-new project from this profile:

```bash
replicax create my-app --profile ./examples/spring-boot/.replicax
```

Inspect or audit it:

```bash
replicax inspect --profile ./examples/spring-boot/.replicax
replicax audit --profile ./examples/spring-boot/.replicax
```

> Regenerate the profile + report after changing `source/` with:
> `UPDATE_EXAMPLES=1 npx vitest run tests/examples.test.ts`
