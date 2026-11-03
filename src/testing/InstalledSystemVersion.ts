/**
 * The installed version of each outside system a recording is stamped with. Reading the git version starts `git --version` and
 * nothing more: it tests nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { release, type }            from 'node:os';
import { join }                     from 'node:path';

import type { RecordedSystem } from './BoundaryRecordings.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

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

function lastWordOfFirstLine(printed: string | null): string | null {
  return printed?.split('\n')[0]?.trim().split(' ').at(-1) ?? null;
}

function gitVersion(): string {
  return printedVersionOf(['git', '--version'])?.replace(GIT_VERSION_PREFIX, '') ?? NOT_INSTALLED;
}

/** The install version names what `version --json` answers; the code version moves with every commit and changes no answer's shape. */
function agentProgressInstallVersion(): string {
  const printed = printedVersionOf([process.execPath, join(REPOSITORY_ROOT, 'agent-progress.ts'), 'version', '--json']);
  if (printed === null) return NOT_INSTALLED;
  const { installVersion } = JSON.parse(printed) as { installVersion?: unknown };
  return `install version ${String(installVersion)}`;
}

function eslintVersion(): string {
  const manifestPath = join(REPOSITORY_ROOT, 'node_modules', 'eslint', 'package.json');
  if (!existsSync(manifestPath)) return NOT_INSTALLED;
  return (JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string }).version;
}

/** macOS `open` and the Windows protocol handler come with the OS and print no version. */
function openerVersion(): string {
  if (process.platform === 'darwin' || process.platform === 'win32') return operatingSystemVersion();
  return lastWordOfFirstLine(printedVersionOf(['xdg-open', '--version'])) ?? NOT_INSTALLED;
}

/** The autostart tool of Linux is `systemctl`; macOS writes a LaunchAgent and runs no tool, and the Windows `reg` prints no version. */
function setupToolsVersion(): string {
  const versions = [`bun ${Bun.version}`, `git ${gitVersion()}`];
  if (process.platform === 'linux') versions.push(`systemctl ${lastWordOfFirstLine(printedVersionOf(['systemctl', '--version'])) ?? NOT_INSTALLED}`);
  if (process.platform === 'win32') versions.push(`reg ${operatingSystemVersion()}`);
  return versions.join(', ');
}

export function installedVersionOf(system: RecordedSystem): string {
  if (system === 'agent-progress') return agentProgressInstallVersion();
  if (system === 'eslint') return eslintVersion();
  if (system === 'gpg') return lastWordOfFirstLine(printedVersionOf(['gpgconf', '--version'])) ?? NOT_INSTALLED;
  if (system === 'opener') return openerVersion();
  if (system === 'setup tools') return setupToolsVersion();
  if (system === 'claude') return printedVersionOf(['claude', '--version'])?.replace(CLAUDE_VERSION_SUFFIX, '') ?? NOT_INSTALLED;
  if (system === 'git') return gitVersion();
  if (system === 'bun') return Bun.version;
  if (system === 'sandbox') return installedSandboxVersion();
  return operatingSystemVersion();
}
