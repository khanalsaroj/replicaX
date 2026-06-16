import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { loadBundle, saveBundle } from '@/core/profile-store';
import { compareBundles, comparisonHasChanges } from '@/core/compare';
import type { Detection, ProfileBundle } from '@/schema';

/**
 * The `examples/` profiles double as documentation and integration tests. Each
 * `examples/<name>/source/` is scanned; the result must match the committed
 * `examples/<name>/.replicax/` profile and `expected/report.txt`.
 *
 * Regenerate the committed artifacts after editing a source fixture with:
 *   UPDATE_EXAMPLES=1 npx vitest run tests/examples.test.ts
 */
const EXAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples');
const UPDATE = process.env.UPDATE_EXAMPLES === '1';

function listExamples(): string[] {
  if (!fs.existsSync(EXAMPLES_DIR)) return [];
  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((name) => fs.existsSync(path.join(EXAMPLES_DIR, name, 'source')))
    .sort();
}

/** Deterministic, color-free snapshot of the detected setup. */
function renderReport(name: string, detections: Detection[]): string {
  const lines = [`${name} — detected setup`, ''];
  for (const d of detections) {
    lines.push(
      `✓ ${d.name.padEnd(20)} ${d.category.padEnd(16)} ${Math.round(d.confidence * 100)}%`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function scanExample(name: string): Promise<ProfileBundle> {
  const scan = await scanProject(path.join(EXAMPLES_DIR, name, 'source'));
  scan.structure.root = name;

  // Fixture files may be checked out with CRLF on some platforms / git configs.
  // ReplicaX captures bytes verbatim (correct), but the *setup* an example
  // represents is line-ending-agnostic, so normalize to LF before building and
  // comparing — keeping the committed profiles deterministic everywhere.
  const tooling = {
    ...scan.tooling,
    files: scan.tooling.files.map((file) => {
      const content = file.content.replace(/\r\n/g, '\n');
      return { ...file, content, bytes: Buffer.byteLength(content, 'utf8') };
    }),
  };

  return buildBundle({ name, tooling, structure: scan.structure, metadata: scan.metadata });
}

/** Zero out machine-dependent metadata so comparisons are host-independent. */
function neutralize(bundle: ProfileBundle): void {
  bundle.metadata.nodeVersion = '0';
  bundle.metadata.platform = '0';
}

describe('examples', () => {
  const names = listExamples();

  it('contains the documented example set', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'react-vite',
        'nextjs-enterprise',
        'react-native',
        'spring-boot',
        'fullstack-react-spring',
      ]),
    );
  });

  for (const name of names) {
    it(`${name}: profile and report stay in sync with source/`, async () => {
      const fresh = await scanExample(name);
      const exampleDir = path.join(EXAMPLES_DIR, name);
      const profileDir = path.join(exampleDir, '.replicax');
      const reportPath = path.join(exampleDir, 'expected', 'report.txt');
      const report = renderReport(name, fresh.metadata.detections ?? []);

      if (UPDATE) {
        await saveBundle(profileDir, fresh);
        await fs.ensureDir(path.dirname(reportPath));
        await fs.writeFile(reportPath, report, 'utf8');
        return;
      }

      const committed = await loadBundle(profileDir);
      neutralize(committed);
      neutralize(fresh);

      const comparison = compareBundles(committed, fresh);
      expect(comparisonHasChanges(comparison)).toBe(false);

      const committedReport = (await fs.readFile(reportPath, 'utf8')).replace(/\r\n/g, '\n');
      expect(committedReport).toBe(report);
    });
  }
});
