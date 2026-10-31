/**
 * Confinement on macOS, design section 5.2: the child writes only the worktree, temp and the plan's cache paths, never the `bin` beside a cache
 * path's ancestors or a denied root, reads no denied root, and reaches the network only when asked. Where `sandbox-exec` cannot apply a
 * profile the child runs unconfined.
 */
import { dirname, join } from 'node:path';

import type { ConfinementPlan, GateConfinement } from './GateConfinement.ts';
import { resolvedPathOf }                        from './ResolvedPath.ts';

export interface SeatbeltPrimitives {
  readonly fileExists:      (path: string) => boolean;
  readonly programSucceeds: (argv: readonly string[]) => boolean;
  readonly writeFile:       (path: string, text: string) => void;
}

export const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec';

const PERMISSIVE_PROBE_PROFILE = '(version 1)(allow default)';
const PROBED_EXECUTABLE = '/usr/bin/true';
const SYSTEM_TEMPORARY_FOLDERS = ['/private/tmp', '/private/var/folders'] as const;
const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
const GLOB_STAR = '*';

function quoted(text: string): string {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function regexEscaped(text: string): string {
  return text.replace(REGEX_SPECIAL_CHARACTERS, '\\$&');
}

/** A raw `#"…"` regex for a glob, its folder before the first `*` resolved; a plain path is a subpath. */
function filterOf(path: string): string {
  const starIndex = path.indexOf(GLOB_STAR);
  if (starIndex < 0) return `(subpath ${quoted(resolvedPathOf(path))})`;
  const fixedFolderEnd = path.lastIndexOf('/', starIndex);
  const fixedFolder = resolvedPathOf(path.slice(0, fixedFolderEnd));
  const pattern = path.slice(fixedFolderEnd).split(GLOB_STAR).map(regexEscaped).join('[^/]*');
  return `(regex #"^${regexEscaped(fixedFolder)}${pattern}$")`;
}

/**
 * The `bin` beside each of a cache path's ancestors, such as `~/.bun/bin`. A `bin` inside the cache path is not denied: Seatbelt checks a
 * rename only at its destination, so a folder holding `bin` renamed into the cache would pass any such deny.
 */
function ancestorBinFolderFiltersOf(cachePath: string): string[] {
  const ancestorBinFolders: string[] = [];
  for (let folder = dirname(cachePath); !ancestorBinFolders.includes(join(folder, 'bin')); folder = dirname(folder)) {
    ancestorBinFolders.push(join(folder, 'bin'));
  }
  return ancestorBinFolders.map((folder) => `(subpath ${quoted(folder)})`);
}

export function seatbeltProfileTextOf(plan: ConfinementPlan): string {
  const writable = [
    plan.worktree,
    ...plan.worktreeAdminFolder === null ? [] : [plan.worktreeAdminFolder],
    ...plan.temporaryDirectory === null ? [] : [plan.temporaryDirectory],
    ...SYSTEM_TEMPORARY_FOLDERS,
    ...plan.writableCachePaths,
  ];
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    `(allow file-write* ${writable.map(filterOf).join(' ')} (regex #"^/dev/"))`,
    // Last, so they win over the writable folders a denied one sits inside, such as a data folder under temp.
    `(deny file-write* ${[...plan.deniedWritableRoots.map(filterOf), ...plan.writableCachePaths.flatMap(ancestorBinFolderFiltersOf)].join(' ')})`,
    `(deny file-read* ${plan.deniedReadableRoots.map(filterOf).join(' ')})`,
    ...plan.network ? [] : ['(deny network-outbound (remote ip))'],
    '',
  ].join('\n');
}

export function createDarwinSeatbelt(primitives: SeatbeltPrimitives): GateConfinement {
  let usable: boolean | null = null;
  // Probed once and by applying a profile, since a process already under a sandbox may not apply another.
  const isUsable = (): boolean => {
    usable ??= primitives.fileExists(SANDBOX_EXEC_PATH) && primitives.programSucceeds([SANDBOX_EXEC_PATH, '-p', PERMISSIVE_PROBE_PROFILE, PROBED_EXECUTABLE]);
    return usable;
  };
  return Object.freeze<GateConfinement>({
    availability:   () => (isUsable() ? { verdict: 'confined', mechanism: 'sandbox-exec' } : { verdict: 'unavailable', reason: 'sandbox-exec cannot apply a profile here' }),
    confinedArgvOf: (plan, argv) => {
      primitives.writeFile(plan.confinementFilePath, seatbeltProfileTextOf(plan));
      return isUsable() ? [SANDBOX_EXEC_PATH, '-f', plan.confinementFilePath, ...argv] : [...argv];
    },
  });
}
