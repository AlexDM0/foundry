/**
 * The per-job confinement of design section 4.4, as the launcher port's neutral `WorkerProfile`: what a builder's sandbox and permission
 * rules deny and allow, from the paths and refs as they stand at launch. The adapter renders it; the process-watcher sandbox reuses its denies.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

import type { CommitSigning, NetworkDomainGuard, WorkerProfile } from '../../lib/agent-launch/WorkerProfile.ts';
import { type GitPathStyle, GitPaths }                           from '../../lib/git/GitPaths.ts';
import { GitProcess }                                            from '../../lib/git/GitProcess.ts';
import type { ShellLine }                                        from '../../lib/shell-line/ShellLine.ts';
import type { Pipeline }                                         from '../../lib/tracker-model/@types/Pipeline.ts';
import { WATCHER_FOLDER_NAME }                                   from '../../lib/watcher/constants/WatcherProtocol.ts';
import { PRODUCT_NAMES }                                         from '../../shared/constants/ProductNames.ts';
import { type CacheFolderStyle, GateCachePaths }                 from './GateCachePaths.ts';

/** Everything a job's confinement names, read once at launch; every path absolute. */
export interface SandboxFacts {
  dataFolder:                string;
  monitorFolder:             string;
  homeDirectory:             string;
  worktree:                  string;
  /** The repository's shared `.git`, which a linked worktree's sandbox may write except where denied. */
  commonGitDirectory:        string;
  /** The main line and every live `group-<name>` branch: the refs only an Overseer landing moves. */
  targetBranches:            readonly string[];
  /** Every `ticket-<id>` branch but the job's own. */
  otherTicketBranches:       readonly string[];
  /** `<common>/worktrees/<name>/` of every linked worktree but the job's own. */
  otherWorktreeAdminFolders: readonly string[];
  hatchDirectory:            string;
  repositoryRoot:            string;
  gitHooksDirectory:         string;
  commitSigning:             CommitSigning;
  /** The Overseer's `PATH` folders, none of which a worker's cache folder may be, sit in or hold. */
  executableSearchPath:      readonly string[];
  cacheFolderStyle:          CacheFolderStyle;
}

export type ProfiledRole = 'builder' | 'reviewer' | 'resolver' | 'product-owner' | 'assistant';

const GPG_FOLDER = '.gnupg';
const GPG_PRIVATE_KEYS_FOLDER = 'private-keys-v1.d';
const GPG_AGENT_SOCKET = 'S.gpg-agent';
const CREDENTIAL_FOLDERS = ['.ssh', '.aws'] as const;
const PRODUCT_OWNER_ROLE: ProfiledRole = 'product-owner';

/** The read-only git verbs and the git a worker commits with; the toolchain comes from the board, the agent-progress verbs are the Hatch's. */
const WORKER_ALLOWED_COMMAND_PREFIXES: readonly (readonly string[])[] = [
  ['git', 'status'],
  ['git', 'diff'],
  ['git', 'log'],
  ['git', 'show'],
  ['git', 'add'],
  ['git', 'commit'],
];

const WORKER_DENIED_GIT_SUBCOMMANDS: readonly (readonly string[])[] = [
  ['push'],
  ['rebase'],
  ['reset'],
  ['commit', '--amend'],
  ['worktree'],
  ['update-ref'],
  ['branch', '-f'],
  ['branch', '-D'],
  ['branch', '-m'],
  ['-C'],
];

/** What a worker may run unasked: the executables the pipeline's prepare and gate lines invoke, then the git verbs. */
function workerAllowedCommandPrefixesOf(toolchainExecutables: readonly string[]): (readonly string[])[] {
  const executables = [...new Set(toolchainExecutables)].filter((executable) => executable !== 'git');
  return [...executables.map((executable) => [executable]), ...WORKER_ALLOWED_COMMAND_PREFIXES];
}

/** The gpg-agent socket when one is there, so a worker's commit is signed with its key folder readable and only its private keys denied. */
function commitSigningOf(homeDirectory: string): CommitSigning {
  const socket = join(homeDirectory, GPG_FOLDER, GPG_AGENT_SOCKET);
  return existsSync(socket) ? { kind: 'agent-sockets', sockets: [socket] } : { kind: 'unsigned' };
}

function deniedWritableRootsOf(facts: SandboxFacts): string[] {
  const headsFolder = join(facts.commonGitDirectory, 'refs', 'heads');
  return [
    facts.dataFolder,
    facts.monitorFolder,
    join(facts.worktree, '.claude'),
    join(facts.commonGitDirectory, 'packed-refs'),
    ...facts.targetBranches.map((branch) => join(headsFolder, branch)),
    ...facts.otherTicketBranches.map((branch) => join(headsFolder, branch)),
    ...facts.otherWorktreeAdminFolders,
  ];
}

/**
 * The monitor's `watchers` folder holds the API token and every Watcher secret, and exists before any worker starts, so a file that appears
 * in it later is covered on every OS. The launch files are named by a glob, which the sandbox and the permission rules both read as one.
 */
function deniedReadableRootsOf(facts: SandboxFacts): string[] {
  const gpgDenied = facts.commitSigning.kind === 'agent-sockets'
    ? join(facts.homeDirectory, GPG_FOLDER, GPG_PRIVATE_KEYS_FOLDER)
    : join(facts.homeDirectory, GPG_FOLDER);
  return [
    join(facts.dataFolder, 'jobs', '*', 'launch-*.json'),
    join(facts.monitorFolder, WATCHER_FOLDER_NAME),
    ...CREDENTIAL_FOLDERS.map((folder) => join(facts.homeDirectory, folder)),
    gpgDenied,
  ];
}

/** A session outside a ticket's worktree is denied the Overseer's folder and every secret, nothing more. */
function sessionDeniedReadableRootsOf(dataFolder: string, monitorFolder: string): string[] {
  return [join(dataFolder, 'overseer'), join(monitorFolder, WATCHER_FOLDER_NAME)];
}

function webNetworkDomainsOf(role: ProfiledRole, networkDomains: readonly string[]): WorkerProfile['webNetworkDomains'] {
  if (role === PRODUCT_OWNER_ROLE) return 'any';
  return networkDomains.length === 0 ? 'none' : [...networkDomains];
}

/** What a worker's sandbox takes from the pipeline: the gates' network and `writes`, and the executables its lines invoke, which it runs unasked. */
export interface WorkerToolchain {
  networkDomains: readonly string[];
  /** Wire paths, as the pipeline stores them; `GateCachePaths` judges them at launch. */
  writes:         readonly string[];
  executables:    readonly string[];
}

export const NO_TOOLCHAIN: WorkerToolchain = Object.freeze({ networkDomains: [], writes: [], executables: [] });

/**
 * Every prepare step and every gate but an `overseerOnly` one, which only the Overseer runs; the ticket's own `network` line is added to the
 * gates' domains. The lines are split in the grammar they run in, so a worker is granted what they invoke and no more.
 */
function workerToolchainOf(pipeline: Readonly<Pipeline> | null, ticketNetworkDomains: readonly string[], shellLine: Pick<ShellLine, 'executablesOf'>): WorkerToolchain {
  const gates = (pipeline?.gates ?? []).filter((gate) => gate.overseerOnly !== true);
  const lines = [...(pipeline?.prepare ?? []).map((step) => step.run), ...gates.map((gate) => gate.run)];
  return {
    networkDomains: [...new Set([...ticketNetworkDomains, ...gates.flatMap((gate) => gate.network ?? [])])],
    writes:         [...new Set(gates.flatMap((gate) => gate.writes ?? []))],
    executables:    lines.flatMap((line) => shellLine.executablesOf(line)),
  };
}

/**
 * A builder or reviewer of a ticket: writes its worktree (the sandbox's default), its own Hatch folder and the gates' `writes` still
 * allowed at launch, reaches the gates' network, and runs unasked the executables of the pipeline's prepare and gate lines.
 */
function writableRootsOf(facts: SandboxFacts, writes: readonly string[]): string[] {
  return GateCachePaths.writableCachePathsOf(writes, facts.homeDirectory, facts.executableSearchPath, facts.cacheFolderStyle);
}

function profileOf(role: ProfiledRole, facts: SandboxFacts, toolchain: WorkerToolchain): WorkerProfile {
  const isWorker = role === 'builder' || role === 'reviewer';
  if (role === 'resolver') return resolverProfileOf(facts);
  const { networkDomains } = toolchain;
  return {
    writableRoots:          isWorker ? writableRootsOf(facts, toolchain.writes) : [],
    deniedWritableRoots:    deniedWritableRootsOf(facts),
    deniedReadableRoots:    deniedReadableRootsOf(facts),
    bashNetworkDomains:     isWorker ? [...networkDomains] : [],
    webNetworkDomains:      role === 'assistant' ? 'none' : webNetworkDomainsOf(role, networkDomains),
    hatchDirectory:         facts.hatchDirectory,
    allowedCommandPrefixes: isWorker ? workerAllowedCommandPrefixesOf(toolchain.executables) : [],
    deniedCommandPrefixes:  isWorker ? WORKER_DENIED_GIT_SUBCOMMANDS.map((subcommand) => ['git', ...subcommand]) : [],
    askUser:                role !== 'assistant',
    skills:                 role === PRODUCT_OWNER_ROLE,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       facts.repositoryRoot,
    gitHooksDirectory:      facts.gitHooksDirectory,
    commitSigning:          facts.commitSigning,
    networkDomainGuard:     isWorker ? networkDomainGuardOf(networkDomains) : null,
  };
}

/**
 * The Airlock's resolver: a builder's denies and signing in the worktree it resolves, committing with the git verbs alone, never asking,
 * never reaching the network, whatever its ticket's `network` line.
 */
function resolverProfileOf(facts: SandboxFacts): WorkerProfile {
  return {
    writableRoots:          [],
    deniedWritableRoots:    deniedWritableRootsOf(facts),
    deniedReadableRoots:    deniedReadableRootsOf(facts),
    bashNetworkDomains:     [],
    webNetworkDomains:      'none',
    hatchDirectory:         facts.hatchDirectory,
    allowedCommandPrefixes: [...WORKER_ALLOWED_COMMAND_PREFIXES],
    deniedCommandPrefixes:  WORKER_DENIED_GIT_SUBCOMMANDS.map((subcommand) => ['git', ...subcommand]),
    askUser:                false,
    skills:                 false,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       facts.repositoryRoot,
    gitHooksDirectory:      facts.gitHooksDirectory,
    commitSigning:          facts.commitSigning,
    networkDomainGuard:     null,
  };
}

/** The `hook bash-domains` guard of design section 4.4, for a worker whose ticket has a `network` line; none without one. */
function networkDomainGuardOf(networkDomains: readonly string[]): NetworkDomainGuard | null {
  if (networkDomains.length === 0) return null;
  return {
    allowedDomains: [...networkDomains],
    commandArgv:    [PRODUCT_NAMES.PROGRAM, 'hook', 'bash-domains', '--allow', networkDomains.join(',')],
  };
}

function gitLinesOf(directory: string, gitArguments: readonly string[]): string[] {
  const run = GitProcess.run(directory, gitArguments);
  return GitProcess.succeeded(run) ? run.standardOutput.split('\n').filter((line) => line !== '') : [];
}

function commonGitDirectoryOf({ pathModule }: GitPathStyle, repositoryRoot: string): string {
  const [commonDirectory = '.git'] = gitLinesOf(repositoryRoot, ['rev-parse', '--git-common-dir']);
  return pathModule.isAbsolute(commonDirectory) ? commonDirectory : pathModule.resolve(repositoryRoot, commonDirectory);
}

/** The worktree's own admin folder name, which git keeps as `<common>/worktrees/<name>`; `null` before the worktree exists. */
function adminFolderOf(worktree: string): string | null {
  const [gitDirectory] = gitLinesOf(worktree, ['rev-parse', '--absolute-git-dir']);
  return gitDirectory === undefined ? null : gitDirectory;
}

export interface SandboxFactsRequest {
  repositoryRoot:       string;
  dataFolder:           string;
  monitorFolder:        string;
  homeDirectory:        string;
  worktree:             string;
  ownBranch:            string;
  mainLine:             string;
  groupPrefix:          string;
  hatchDirectory:       string;
  executableSearchPath: readonly string[];
  cacheFolderStyle:     CacheFolderStyle;
}

/** Each admin folder as git prints it, `--absolute-git-dir` answering with symlinks resolved. */
export interface AdminFolderListing {
  commonGitDirectory: string;
  listedAdminFolders: readonly string[];
  ownAdminFolder:     string | null;
}

/** `<common>/worktrees/<name>` of every listed worktree but the job's own, compared in one canonical form against git's spelling. */
function otherWorktreeAdminFoldersOf(style: GitPathStyle, listing: AdminFolderListing): string[] {
  const { pathModule } = style;
  const worktreesFolder = pathModule.join(listing.commonGitDirectory, 'worktrees');
  const ownAdminFolder = listing.ownAdminFolder === null ? null : GitPaths.canonicalOf(style, listing.ownAdminFolder);
  return listing.listedAdminFolders
    .filter((folder) => GitPaths.relativeInsideOf(style, worktreesFolder, folder) !== null && GitPaths.canonicalOf(style, folder) !== ownAdminFolder)
    .map((folder) => pathModule.join(worktreesFolder, pathModule.basename(folder)));
}

/** Read from git at launch: a ref or worktree created later is V14's to catch, never this list's. */
function sandboxFactsOf(request: SandboxFactsRequest): SandboxFacts {
  const commonGitDirectory = commonGitDirectoryOf(request.cacheFolderStyle, request.repositoryRoot);
  const branches = gitLinesOf(request.repositoryRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  const adminFolders = otherWorktreeAdminFoldersOf(request.cacheFolderStyle, {
    commonGitDirectory,
    listedAdminFolders: gitLinesOf(request.repositoryRoot, ['worktree', 'list', '--porcelain'])
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length))
      .flatMap((path) => adminFolderOf(path) ?? []),
    ownAdminFolder: adminFolderOf(request.worktree),
  });
  return {
    dataFolder:                request.dataFolder,
    monitorFolder:             request.monitorFolder,
    homeDirectory:             request.homeDirectory,
    worktree:                  request.worktree,
    commonGitDirectory,
    targetBranches:            [request.mainLine, ...branches.filter((branch) => branch.startsWith(request.groupPrefix))],
    otherTicketBranches:       branches.filter((branch) => branch.startsWith('ticket-') && branch !== request.ownBranch),
    otherWorktreeAdminFolders: adminFolders,
    hatchDirectory:            request.hatchDirectory,
    repositoryRoot:            request.repositoryRoot,
    gitHooksDirectory:         join(request.repositoryRoot, '.githooks'),
    commitSigning:             commitSigningOf(request.homeDirectory),
    executableSearchPath:      request.executableSearchPath,
    cacheFolderStyle:          request.cacheFolderStyle,
  };
}

export const WorkerProfiles = Object.freeze({
  profileOf,
  workerToolchainOf,
  sandboxFactsOf,
  otherWorktreeAdminFoldersOf,
  deniedWritableRootsOf,
  deniedReadableRootsOf,
  sessionDeniedReadableRootsOf,
});
