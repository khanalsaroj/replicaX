import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { scanProject } from '@/core/scanner';
import { buildBundle } from '@/core/profile-generator';
import { loadBundle, profileDir, saveBundle } from '@/core/profile-store';
import {
  exportProfile,
  extractToTemp,
  findProfileRoot,
  safeExtract,
  PROFILE_ARCHIVE_LIMITS,
  REPO_ARCHIVE_LIMITS,
  type ArchiveLimits,
} from '@/core/archive';
import { makeTempDir, scaffoldSampleProject } from './helpers';

/** Build a single ustar tar header block (512 bytes) with a valid checksum. */
function tarHeader(name: string, size: number, typeflag: string, linkname: string): Buffer {
  const h = Buffer.alloc(512, 0);
  h.write(name.slice(0, 100), 0, 'utf8');
  h.write('0000777\0', 100, 'ascii'); // mode
  h.write('0000000\0', 108, 'ascii'); // uid
  h.write('0000000\0', 116, 'ascii'); // gid
  h.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); // size
  h.write('00000000000\0', 136, 'ascii'); // mtime
  h.write('        ', 148, 'ascii'); // checksum placeholder (8 spaces)
  h.write(typeflag, 156, 'ascii');
  h.write(linkname.slice(0, 100), 157, 'utf8');
  h.write('ustar\0', 257, 'ascii');
  h.write('00', 263, 'ascii');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i]!;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return h;
}

interface TarEntry {
  name: string;
  content?: string;
  /** ustar typeflag: '0' file, '5' dir, '2' symlink, '1' hardlink. */
  type?: string;
  linkname?: string;
}

/** Assemble a gzipped tar archive in memory from raw entries (for hostile inputs). */
function makeTarGz(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const e of entries) {
    const type = e.type ?? '0';
    const content = Buffer.from(e.content ?? '', 'utf8');
    const size = type === '0' ? content.length : 0;
    blocks.push(tarHeader(e.name, size, type, e.linkname ?? ''));
    if (size > 0) {
      blocks.push(content);
      const rem = content.length % 512;
      if (rem > 0) blocks.push(Buffer.alloc(512 - rem, 0));
    }
  }
  blocks.push(Buffer.alloc(1024, 0)); // two trailing zero blocks
  return zlib.gzipSync(Buffer.concat(blocks));
}

async function writeArchive(dir: string, name: string, entries: TarEntry[]): Promise<string> {
  const file = path.join(dir, name);
  await fs.writeFile(file, makeTarGz(entries));
  return file;
}

let root: string;

beforeEach(async () => {
  root = await makeTempDir('replicax-archive-');
  await scaffoldSampleProject(root);
});

afterEach(async () => {
  await fs.remove(root);
});

describe('archive export/import', () => {
  it('round-trips a profile through a tar.gz archive', async () => {
    const dir = profileDir(root);
    const scan = await scanProject(root);
    const bundle = buildBundle({
      name: 'archived',
      tooling: scan.tooling,
      structure: scan.structure,
      metadata: scan.metadata,
    });
    await saveBundle(dir, bundle);

    const out = path.join(root, 'profile.tar.gz');
    await exportProfile(dir, out);
    expect((await fs.stat(out)).size).toBeGreaterThan(0);

    const tmp = await extractToTemp(out);
    const found = await findProfileRoot(tmp);
    expect(found).not.toBeNull();

    const reloaded = await loadBundle(found!);
    expect(reloaded.profile.name).toBe('archived');
    expect(reloaded.tooling.files.length).toBe(bundle.tooling.files.length);

    await fs.remove(tmp);
  });
});

describe('safeExtract hardening', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTempDir('replicax-safeextract-');
  });
  afterEach(async () => {
    await fs.remove(dir);
  });

  it('extracts a benign archive', async () => {
    const archive = await writeArchive(dir, 'ok.tar.gz', [
      { name: 'a.txt', content: 'hello' },
      { name: 'sub/b.txt', content: 'world' },
    ]);
    const dest = path.join(dir, 'out');
    await safeExtract(archive, dest, PROFILE_ARCHIVE_LIMITS);
    expect(await fs.readFile(path.join(dest, 'a.txt'), 'utf8')).toBe('hello');
    expect(await fs.readFile(path.join(dest, 'sub', 'b.txt'), 'utf8')).toBe('world');
  });

  it('rejects a path-traversal entry and writes nothing outside the target', async () => {
    const archive = await writeArchive(dir, 'evil.tar.gz', [
      { name: '../escape.txt', content: 'pwned' },
    ]);
    const dest = path.join(dir, 'out');
    await expect(safeExtract(archive, dest, PROFILE_ARCHIVE_LIMITS)).rejects.toThrow(
      /unsafe path/i,
    );
    expect(await fs.pathExists(path.join(dir, 'escape.txt'))).toBe(false);
  });

  it('rejects an absolute-path entry', async () => {
    const archive = await writeArchive(dir, 'abs.tar.gz', [
      { name: '/tmp/replicax-abs-escape', content: 'x' },
    ]);
    await expect(
      safeExtract(archive, path.join(dir, 'out'), PROFILE_ARCHIVE_LIMITS),
    ).rejects.toThrow();
  });

  it('rejects a symlink entry for profile archives', async () => {
    const archive = await writeArchive(dir, 'link.tar.gz', [
      { name: 'link', type: '2', linkname: '/etc/passwd' },
    ]);
    await expect(
      safeExtract(archive, path.join(dir, 'out'), PROFILE_ARCHIVE_LIMITS),
    ).rejects.toThrow(/link entry/i);
  });

  it('skips (does not fail on, does not extract) symlinks for repo archives', async () => {
    const archive = await writeArchive(dir, 'repo.tar.gz', [
      { name: 'real.txt', content: 'kept' },
      { name: 'link', type: '2', linkname: 'real.txt' },
    ]);
    const dest = path.join(dir, 'out');
    await safeExtract(archive, dest, REPO_ARCHIVE_LIMITS);
    expect(await fs.pathExists(path.join(dest, 'real.txt'))).toBe(true);
    expect(await fs.pathExists(path.join(dest, 'link'))).toBe(false);
  });

  it('rejects an oversized single file (tar bomb / per-file cap)', async () => {
    const archive = await writeArchive(dir, 'big.tar.gz', [
      { name: 'big.txt', content: 'x'.repeat(4096) },
    ]);
    const limits: ArchiveLimits = { ...PROFILE_ARCHIVE_LIMITS, maxEntryBytes: 1024 };
    await expect(safeExtract(archive, path.join(dir, 'out'), limits)).rejects.toThrow(
      /per-file size limit/i,
    );
  });

  it('rejects too many entries', async () => {
    const entries: TarEntry[] = Array.from({ length: 50 }, (_, i) => ({
      name: `f${i}.txt`,
      content: 'x',
    }));
    const archive = await writeArchive(dir, 'many.tar.gz', entries);
    const limits: ArchiveLimits = { ...PROFILE_ARCHIVE_LIMITS, maxEntries: 10 };
    await expect(safeExtract(archive, path.join(dir, 'out'), limits)).rejects.toThrow(
      /too many entries/i,
    );
  });

  it('rejects an archive whose uncompressed total exceeds the cap', async () => {
    const entries: TarEntry[] = Array.from({ length: 20 }, (_, i) => ({
      name: `f${i}.txt`,
      content: 'x'.repeat(1024),
    }));
    const archive = await writeArchive(dir, 'total.tar.gz', entries);
    const limits: ArchiveLimits = { ...PROFILE_ARCHIVE_LIMITS, maxTotalBytes: 4096 };
    await expect(safeExtract(archive, path.join(dir, 'out'), limits)).rejects.toThrow(
      /too large when uncompressed/i,
    );
  });

  it('rejects an archive larger than the compressed cap', async () => {
    const archive = await writeArchive(dir, 'fat.tar.gz', [{ name: 'a.txt', content: 'data' }]);
    const limits: ArchiveLimits = { ...PROFILE_ARCHIVE_LIMITS, maxCompressedBytes: 8 };
    await expect(safeExtract(archive, path.join(dir, 'out'), limits)).rejects.toThrow(
      /file is too large/i,
    );
  });

  it('extractToTemp cleans up the temp dir when extraction is rejected', async () => {
    const before = await fs.readdir(os.tmpdir());
    const archive = await writeArchive(dir, 'reject.tar.gz', [
      { name: '../escape.txt', content: 'x' },
    ]);
    await expect(extractToTemp(archive)).rejects.toThrow();
    const after = await fs.readdir(os.tmpdir());
    const leaked = after.filter((n) => n.startsWith('replicax-import-') && !before.includes(n));
    expect(leaked).toEqual([]);
  });
});
