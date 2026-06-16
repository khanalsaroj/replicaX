# ReplicaX example profiles

Each folder is a worked example: a sample project under `source/`, the ReplicaX profile
generated from it under `.replicax/`, and a `expected/report.txt` snapshot of the detected
setup. They are **documentation and integration tests at once** — `tests/examples.test.ts`
re-scans every `source/` and asserts the result still matches the committed profile + report.

| Example | Stack | Highlights |
|---------|-------|------------|
| [`react-vite`](./react-vite) | React + Vite + TypeScript | TypeScript, ESLint, Prettier, Vitest |
| [`nextjs-enterprise`](./nextjs-enterprise) | Next.js | Jest, Husky + lint-staged + Commitlint, Docker, GitHub Actions |
| [`react-native`](./react-native) | React Native (Yarn) | TypeScript, ESLint, Prettier, Jest |
| [`spring-boot`](./spring-boot) | Spring Boot (Maven) | Java, Maven, Spring Boot, Docker, CI — a non-Node stack |
| [`fullstack-react-spring`](./fullstack-react-spring) | React + Spring Boot | Polyglot monorepo, Docker Compose, nested backend detection |

## Try one

```bash
# Scaffold a new project from any example profile
replicax create my-app --profile ./examples/nextjs-enterprise/.replicax

# Inspect or audit it
replicax inspect --profile ./examples/spring-boot/.replicax
replicax audit   --profile ./examples/nextjs-enterprise/.replicax

# Compare two stacks
replicax compare ./examples/react-vite ./examples/nextjs-enterprise
```

## Regenerating

After editing a `source/` fixture, regenerate the committed profile and report:

```bash
UPDATE_EXAMPLES=1 npx vitest run tests/examples.test.ts
```
