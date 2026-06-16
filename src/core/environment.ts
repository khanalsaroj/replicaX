import { ENVIRONMENT_TOOLS, type EnvTool, type EnvToolKind } from '@/config/environment-tools';
import { commandExists, getCommandOutput } from '@/core/process';

/** Result of probing one tool from the environment catalogue. */
export interface EnvCheck {
  id: string;
  name: string;
  kind: EnvToolKind;
  found: boolean;
  /** Detected version, when the tool reported one. */
  version?: string;
}

/**
 * A probe resolves "is this tool installed, and what version". It is injectable
 * so `replicax doctor` can be tested deterministically without spawning real
 * binaries (see {@link defaultProbe} for the real implementation).
 */
export type ToolProbe = (tool: EnvTool) => Promise<{ found: boolean; version?: string }>;

/**
 * Generic version extractor: first semver-ish token in the output, plus an
 * optional `-prerelease`/`+build` suffix. Deliberately does NOT swallow trailing
 * platform segments like `2.45.1.windows.1` (those aren't `-`/`+` separated).
 */
export function parseVersionDefault(raw: string): string | undefined {
  const trimmed = raw.trim();
  const semver = trimmed.match(/\d+\.\d+\.\d+(?:[-+][\w.]+)?/);
  if (semver) return semver[0];
  const loose = trimmed.match(/\d+\.\d+/);
  return loose ? loose[0] : undefined;
}

/**
 * Real probe: ask the tool for its version. We run via the shell because the
 * `bin` + `versionArgs` are trusted static catalogue values, and on Windows the
 * shell is required to invoke `.cmd` shims (npm, code, …). If the version call
 * fails we fall back to a plain PATH existence check so "installed but
 * `--version` misbehaved" still reports as found.
 */
export const defaultProbe: ToolProbe = async (tool) => {
  const out = await getCommandOutput(tool.bin, tool.versionArgs, { shell: true });
  if (out.ok) {
    const raw = out.stdout.trim() || out.stderr.trim();
    const parse = tool.parseVersion ?? parseVersionDefault;
    return { found: true, version: parse(raw) };
  }
  return { found: await commandExists(tool.bin) };
};

/** Probe every catalogued tool (or a custom list) in parallel. */
export async function runEnvironmentChecks(
  tools: EnvTool[] = ENVIRONMENT_TOOLS,
  probe: ToolProbe = defaultProbe,
): Promise<EnvCheck[]> {
  return Promise.all(
    tools.map(async (tool) => {
      const result = await probe(tool);
      return {
        id: tool.id,
        name: tool.name,
        kind: tool.kind,
        found: result.found,
        version: result.version,
      };
    }),
  );
}
