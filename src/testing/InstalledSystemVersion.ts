/**
 * The installed version of each outside system a recording is stamped with. Reading the git version starts `git --version` and
 * nothing more: it tests nothing.
 */
import { release, type } from 'node:os';

import type { RecordedSystem } from './BoundaryRecordings.ts';

const GIT_VERSION_PREFIX = 'git version ';
/** `claude --version` prints `2.1.311 (Claude Code)`; the init line's `claude_code_version` is `2.1.311`. */
const CLAUDE_VERSION_SUFFIX = / \(Claude Code\)$/u;

const NOT_INSTALLED = 'not installed';

function printedVersionOf(argv: readonly string[]): string | null {
  try {
    const finished = Bun.spawnSync([...argv], { stdout: 'pipe', stderr: 'pipe' });
    return finished.exitCode === 0 ? finished.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

function operatingSystemVersion(): string {
  return `${type()} ${release()}`;
}

/** Linux confines a gate with `bwrap`, a program of its own; macOS with `sandbox-exec`, which comes with the OS and has no version. */
function installedSandboxVersion(): string {
  if (process.platform !== 'linux') return operatingSystemVersion();
  return printedVersionOf(['bwrap', '--version']) ?? NOT_INSTALLED;
}

export function installedVersionOf(system: RecordedSystem): string {
  if (system === 'claude') return printedVersionOf(['claude', '--version'])?.replace(CLAUDE_VERSION_SUFFIX, '') ?? NOT_INSTALLED;
  if (system === 'git') return printedVersionOf(['git', '--version'])?.replace(GIT_VERSION_PREFIX, '') ?? NOT_INSTALLED;
  if (system === 'bun') return Bun.version;
  if (system === 'sandbox') return installedSandboxVersion();
  return operatingSystemVersion();
}
