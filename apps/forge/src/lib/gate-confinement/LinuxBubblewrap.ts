/**
 * Confinement on Linux through bubblewrap, the Seatbelt rules mapped onto mounts. A fresh `/proc` in its own pid namespace keeps the
 * supervisor's `/proc/<pid>/environ` out of reach. A denied path absent at launch renders nothing, since a bind would create its mount
 * point; a caller makes a denied root inside a writable bind before the launch, so it exists and gets its mount.
 */
import { ancestorBinFoldersOf } from './AncestorBinFolders.ts';
import type {
  ConfinementAvailability,
  ConfinementPlan,
  ConfinementUnavailability,
  GateConfinement
} from './GateConfinement.ts';

export type HostPathKind = 'directory' | 'file' | 'absent';

/** The host's file tree as the argv is rendered against it, read afresh at every launch. */
export interface HostTree {
  readonly kindOf:         (path: string) => HostPathKind;
  /** The names in a folder; none when it cannot be read. */
  readonly entriesOf:      (folder: string) => readonly string[];
  readonly resolvedPathOf: (path: string) => string;
}

export interface ProgramRun {
  readonly exitCode: number | null;
  readonly output:   string;
}

export interface BubblewrapPrimitives {
  readonly executablePathOf: (name: string) => string | null;
  readonly runProgram:       (argv: readonly string[]) => ProgramRun;
  readonly tree:             HostTree;
}

export interface BubblewrapInstall {
  readonly executablePath:          string;
  /** Bubblewrap 0.8.0 and later can refuse the child a user namespace of its own. */
  readonly refusesNestedNamespaces: boolean;
}

export const BUBBLEWRAP_MECHANISM = 'bubblewrap';

export const BUBBLEWRAP_EXECUTABLE_NAME = 'bwrap';
const SYSTEM_TEMPORARY_FOLDERS = ['/tmp', '/var/tmp'] as const;
const NESTED_NAMESPACE_REFUSAL_VERSION = '0.8.0';
const VERSION_PATTERN = /bubblewrap (\d+)\.(\d+)\.(\d+)/;
const GLOB_STAR = '*';
const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
const PROBED_PROGRAM = 'true';

function globSegmentMatcherOf(segment: string): RegExp {
  return new RegExp(`^${segment.split(GLOB_STAR).map((part) => part.replace(REGEX_SPECIAL_CHARACTERS, '\\$&')).join('[^/]*')}$`);
}

/** Every existing path a pattern names, a `*` matching within one segment; a plain path names itself when it exists. */
function existingPathsOf(pattern: string, tree: HostTree): string[] {
  const segments = pattern.split('/').filter((segment) => segment !== '');
  let paths = ['/'];
  for (const segment of segments) {
    paths = paths.flatMap((folder) => {
      const prefix = folder === '/' ? '' : folder;
      if (!segment.includes(GLOB_STAR)) return [`${prefix}/${segment}`];
      const matcher = globSegmentMatcherOf(segment);
      return tree.entriesOf(folder).filter((name) => matcher.test(name)).map((name) => `${prefix}/${name}`);
    });
  }
  return paths.filter((path) => tree.kindOf(path) !== 'absent').map((path) => tree.resolvedPathOf(path));
}

function namespaceArgumentsOf(install: BubblewrapInstall, network: boolean): string[] {
  return [
    ...install.refusesNestedNamespaces ? ['--unshare-user', '--disable-userns'] : [],
    '--unshare-pid',
    ...network ? [] : ['--unshare-net'],
    '--die-with-parent',
    '--new-session',
  ];
}

function readDenyArgumentsOf(path: string, tree: HostTree): string[] {
  return tree.kindOf(path) === 'directory' ? ['--tmpfs', path, '--remount-ro', path] : ['--ro-bind', '/dev/null', path];
}

export function bubblewrapArgvOf(plan: ConfinementPlan, argv: readonly string[], install: BubblewrapInstall, tree: HostTree): string[] {
  const optionalWritableRoots = [
    ...plan.writableRoots,
    ...plan.worktreeAdminFolder === null ? [] : [plan.worktreeAdminFolder],
    ...SYSTEM_TEMPORARY_FOLDERS,
    ...plan.temporaryDirectory === null ? [] : [plan.temporaryDirectory],
    ...plan.writableCachePaths,
  ];
  const deniedWritablePaths = [...plan.deniedWritableRoots, ...plan.writableCachePaths.flatMap(ancestorBinFoldersOf)].flatMap((pattern) => existingPathsOf(pattern, tree));
  const deniedReadablePaths = plan.deniedReadableRoots.flatMap((pattern) => existingPathsOf(pattern, tree));
  const worktree = tree.resolvedPathOf(plan.worktree);
  return [
    install.executablePath,
    '--ro-bind',
    '/',
    '/',
    '--dev',
    '/dev',
    '--proc',
    '/proc',
    '--bind',
    worktree,
    worktree,
    ...optionalWritableRoots.map((path) => tree.resolvedPathOf(path)).flatMap((path) => ['--bind-try', path, path]),
    // After the writable binds, so a denied folder inside one, such as a data folder under temp, stays read-only.
    ...deniedWritablePaths.flatMap((path) => ['--ro-bind', path, path]),
    ...deniedReadablePaths.flatMap((path) => readDenyArgumentsOf(path, tree)),
    ...namespaceArgumentsOf(install, plan.network),
    '--',
    ...argv,
  ];
}

function versionOf(output: string): readonly number[] | null {
  const match = VERSION_PATTERN.exec(output);
  return match === null ? null : match.slice(1).map(Number);
}

function versionIsAtLeast(version: readonly number[], minimum: readonly number[]): boolean {
  for (let i = 0; i < minimum.length; i += 1) {
    const part = version[i] ?? 0;
    const minimumPart = minimum[i] ?? 0;
    if (part !== minimumPart) return part > minimumPart;
  }
  return true;
}

function firstLineOf(output: string): string {
  return output.trim().split('\n')[0] ?? '';
}

type BubblewrapProbe = { readonly availability: ConfinementAvailability; readonly install: BubblewrapInstall | null };

function unavailable(unavailability: ConfinementUnavailability): BubblewrapProbe {
  return { availability: { verdict: 'unavailable', unavailability }, install: null };
}

function probeOf(primitives: BubblewrapPrimitives): BubblewrapProbe {
  const executablePath = primitives.executablePathOf(BUBBLEWRAP_EXECUTABLE_NAME);
  if (executablePath === null) return unavailable({ cause: 'bubblewrap-not-on-search-path' });
  const versionRun = primitives.runProgram([executablePath, '--version']);
  const version = versionRun.exitCode === 0 ? versionOf(versionRun.output) : null;
  if (version === null) return unavailable({ cause: 'bubblewrap-version-unread', processMessage: firstLineOf(versionRun.output) });
  const install = { executablePath, refusesNestedNamespaces: versionIsAtLeast(version, NESTED_NAMESPACE_REFUSAL_VERSION.split('.').map(Number)) };
  const namespaceRun = primitives.runProgram([
    executablePath, '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', ...namespaceArgumentsOf(install, false), '--', PROBED_PROGRAM,
  ]);
  if (namespaceRun.exitCode !== 0) {
    return unavailable({ cause: 'bubblewrap-namespaces-refused', processMessage: firstLineOf(namespaceRun.output) });
  }
  const mechanism = install.refusesNestedNamespaces
    ? BUBBLEWRAP_MECHANISM
    : `${BUBBLEWRAP_MECHANISM}, older than ${NESTED_NAMESPACE_REFUSAL_VERSION}, so a child may nest user namespaces`;
  return { availability: { verdict: 'confined', mechanism }, install };
}

export function createLinuxBubblewrap(primitives: BubblewrapPrimitives): GateConfinement {
  let probe: BubblewrapProbe | null = null;
  // Probed once, by running a namespace, since an installed bwrap may still be stopped by the kernel or a container.
  const probed = (): BubblewrapProbe => {
    probe ??= probeOf(primitives);
    return probe;
  };
  return Object.freeze<GateConfinement>({
    availability:      () => probed().availability,
    // A worker's launch demands its sandbox, so a worker that runs at all is confined.
    workerConfinement: () => 'confined',
    confinedArgvOf:    (plan, argv) => {
      const { install } = probed();
      return install === null ? [...argv] : bubblewrapArgvOf(plan, argv, install, primitives.tree);
    },
  });
}
