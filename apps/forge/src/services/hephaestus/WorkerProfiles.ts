/**
 * The per-job confinement of design section 4.4, as the launcher port's neutral `WorkerProfile`: what a builder's sandbox and permission
 * rules deny and allow, from the paths and refs as they stand at launch. The adapter renders it; the line sandbox reuses its denies.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative
} from 'node:path';

import type { HephaestusLogRecord }                   from '../../adapters/@types/HephaestusLogRecord.ts';
import { PRIVATE_FOLDER_NAME }                        from '../../domain/talos/constants/TalosProtocol.ts';
import type { JobRole }                               from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey, Pipeline, PipelineEntity }   from '../../domain/tracker-model/@types/Pipeline.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { PipelineUtil }                               from '../../domain/tracker-model/utils/PipelineUtil.ts';
import type {
  CommitSigning,
  NetworkDomainGuard,
  SandboxDenyShape,
  StageEditGuard,
  WorkerProfile
} from '../../lib/agent-launch/WorkerProfile.ts';
import { type GitPathStyle, GitPaths }           from '../../lib/git/GitPaths.ts';
import { GitProcess }                            from '../../lib/git/GitProcess.ts';
import type { ShellLine }                        from '../../lib/shell-line/ShellLine.ts';
import type { BranchNames }                      from '../../shared/BranchNames.ts';
import { type CacheFolderStyle, GateCachePaths } from './GateCachePaths.ts';
import { GpgDirectories }                        from './GpgDirectories.ts';
import { hephaestusFilesIn }                     from './HephaestusFiles.ts';

/** Everything a job's confinement names, read once at launch; every path absolute. */
export interface SandboxFacts {
  dataFolder:                    string;
  monitorFolder:                 string;
  homeDirectory:                 string;
  worktree:                      string;
  /** The repository's shared `.git`, which a linked worktree's sandbox may write except where denied. */
  commonGitDirectory:            string;
  /** The main line and every live `group-<name>` branch: the refs only a Hephaestus landing moves. */
  targetBranches:                readonly string[];
  /** Every ticket branch of the board but the job's own, and on a namespaced board every branch of another namespace. */
  otherTicketBranches:           readonly string[];
  /** `<common>/worktrees/<name>/` of every linked worktree but the job's own. */
  otherWorktreeAdminFolders:     readonly string[];
  hatchDirectory:                string;
  repositoryRoot:                string;
  /** The tracker's project folder below the repository root, `/`-separated; absent for a tracker at its repository's root. */
  projectPrefix?:                string;
  gitHooksDirectory:             string;
  commitSigning:                 CommitSigning;
  /** The agent vendor's per-OS list of the user's credential files and folders, which every role is denied reading. */
  credentialPaths:               readonly string[];
  /** GnuPG's home as gpgconf reports it, or GnuPG's default when it cannot say. */
  gpgHomeDirectory:              string;
  /** Hephaestus's `PATH` folders, none of which a worker's cache folder may be, sit in or hold. */
  executableSearchPath:          readonly string[];
  cacheFolderStyle:              CacheFolderStyle;
  sandboxDenyShape:              SandboxDenyShape;
  /** The agent adapter's configuration folder names, which no job may write wherever the agent reads its configuration. */
  agentConfigurationFolderNames: readonly string[];
  /** Hephaestus's absolute Bun runtime, its isolating arguments and its entry script, which the network guard runs; `null` when it cannot start. */
  guardCommand:                  readonly string[] | null;
  /** Every home folder of the pipeline's entities, repository paths leading with `/`; absent on a forge without entities. */
  entityHomes?:                  readonly string[];
  /** The entity whose stage the job runs, among the pipeline's entities; absent for a job without an entity. */
  stageEntity?:                  StageEntity;
}

/** The entity whose stage a job runs: its homes and `reach` are what the job's file edits may change. */
export interface StageEntity {
  entities:       PipelineEntities;
  entityKey:      EntityKey;
  /** The homes of the whitelisted packages a stage 1 job may write a proposal in; absent in every other stage. */
  proposalHomes?: readonly string[];
}

/** The host's file tree as a `mount-points` profile is rendered against it, read afresh at every launch. */
export interface HostPathCheck {
  exists(path: string): boolean;
}

const REAL_HOST_PATHS: HostPathCheck = Object.freeze({ exists: (path: string) => existsSync(path) });

/** Each deny is one mount, and the sandbox runtime holds about 3000 mounts across all its denies, allows and system binds. */
const MOUNT_POINT_DENIED_WRITABLE_ROOTS_LIMIT = 1000;

export type ProfiledRole = 'builder' | 'reviewer' | 'product-owner' | 'assistant';

const GPG_PRIVATE_KEYS_FOLDER = 'private-keys-v1.d';
const PRODUCT_OWNER_ROLE: ProfiledRole = 'product-owner';

/** The read-only git verbs and the git a worker commits with; the toolchain comes from the job's pipeline, the agent-progress verbs are the Hatch's. */
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

/**
 * The gpg-agent socket gpgconf names, when it is there, with the keyboxd socket a `use-keyboxd` gpg also needs, so a worker's commit is signed
 * with its key folder readable and only its private keys denied. No gpgconf, or no agent socket, commits unsigned.
 */
function commitSigningOf(directories: GpgDirectories | null, hostPaths: HostPathCheck = REAL_HOST_PATHS): CommitSigning {
  const agentSocket = directories?.agentSocket ?? null;
  if (agentSocket === null || !hostPaths.exists(agentSocket)) return { kind: 'unsigned' };
  const keyboxdSocket = directories?.keyboxdSocket ?? null;
  return { kind: 'agent-sockets', sockets: keyboxdSocket === null ? [agentSocket] : [agentSocket, keyboxdSocket] };
}

/** The one record a repository that signs its commits gets logged when a worker's profile commits unsigned; `null` when nothing is lost. */
function unsignedCommitNoticeOf(
  profile: Pick<WorkerProfile, 'commitSigning'>, repositorySignsCommits: boolean, jobId: string,
): Extract<HephaestusLogRecord, { kind: 'commits-unsigned-despite-signing' }> | null {
  if (!repositorySignsCommits || profile.commitSigning.kind !== 'unsigned') return null;
  return { kind: 'commits-unsigned-despite-signing', jobId };
}

/** Each credential path the vendor names, then GnuPG's home: whole while commits go unsigned, only its private keys while an agent signs. */
function credentialRootsOf(facts: Pick<SandboxFacts, 'credentialPaths' | 'gpgHomeDirectory'>, commitSigning: CommitSigning): string[] {
  const gpgDenied = commitSigning.kind === 'agent-sockets' ? join(facts.gpgHomeDirectory, GPG_PRIVATE_KEYS_FOLDER) : facts.gpgHomeDirectory;
  return [...facts.credentialPaths, gpgDenied];
}

/** Makes a folder and its parents; true when the path exists afterwards. */
export interface FolderMaker {
  makeFolder(path: string): boolean;
}

type AgentConfigurationFolderFacts = Pick<SandboxFacts, 'worktree' | 'projectPrefix' | 'entityHomes' | 'agentConfigurationFolderNames'>;

/** What the denied roots a launch makes are read from. */
export type DeniedRootFacts = AgentConfigurationFolderFacts & Pick<SandboxFacts, 'sandboxDenyShape'>;

const REAL_FOLDER_MAKER: FolderMaker = Object.freeze({
  makeFolder: (path: string) => {
    try {
      mkdirSync(path, { recursive: true });
    } catch {
      // The check below gives the verdict.
    }
    return existsSync(path);
  },
});

/**
 * The agent's configuration folders of the worktree no job may write, each name the adapter gives: at its root, for a tracker below the
 * repository root at its project's folder, and on a forge with entities at every entity home.
 */
function agentConfigurationFoldersOf(facts: AgentConfigurationFolderFacts): string[] {
  const projectPrefix = facts.projectPrefix ?? '';
  const entityHomeFolders = (facts.entityHomes ?? []).map((home) => EntityOwnershipUtil.homeFolderOf(home));
  const folders = facts.agentConfigurationFolderNames.flatMap((folderName) => [
    join(facts.worktree, folderName),
    ...(projectPrefix === '' ? [] : [join(facts.worktree, projectPrefix, folderName)]),
    ...entityHomeFolders.map((homeFolder) => join(facts.worktree, homeFolder, folderName)),
  ]);
  return [...new Set(folders)];
}

/**
 * The denied writable roots inside the worktree's writable bind. Under `mount-points` a denied path absent at launch gets no mount, so a
 * child could make it; Hephaestus makes each of these before every launch instead, and they are denied whether or not they existed.
 */
function deniedRootsMadeBeforeLaunchOf(facts: DeniedRootFacts): string[] {
  return facts.sandboxDenyShape === 'mount-points' ? agentConfigurationFoldersOf(facts) : [];
}

/** Makes each denied root a launch makes; the first that cannot be made refuses the launch, otherwise `null`. */
function unmadeDeniedRootOf(
  facts: DeniedRootFacts, folderMaker: FolderMaker = REAL_FOLDER_MAKER
): string | null {
  return deniedRootsMadeBeforeLaunchOf(facts).find((root) => !folderMaker.makeFolder(root)) ?? null;
}

/** The roots every job of the worktree is denied writing, whatever other jobs run. */
function fixedDeniedWritableRootsOf(facts: SandboxFacts): string[] {
  const headsFolder = join(facts.commonGitDirectory, 'refs', 'heads');
  return [
    facts.dataFolder,
    facts.monitorFolder,
    ...agentConfigurationFoldersOf(facts),
    join(facts.commonGitDirectory, 'packed-refs'),
    ...facts.targetBranches.map((branch) => join(headsFolder, branch)),
  ];
}

/**
 * Under `mount-points` an absent loose ref is never denied: the mount point would stand on the host as a broken ref. A ref held only in
 * `packed-refs` is protected by the `packed-refs` deny, and a ref moved all the same is V14's to catch.
 */
function deniedWritableRootsOf(facts: SandboxFacts, hostPaths: HostPathCheck = REAL_HOST_PATHS): string[] {
  const headsFolder = join(facts.commonGitDirectory, 'refs', 'heads');
  const fixedRoots = fixedDeniedWritableRootsOf(facts);
  const otherJobRoots = [...facts.otherTicketBranches.map((branch) => join(headsFolder, branch)), ...facts.otherWorktreeAdminFolders];
  if (facts.sandboxDenyShape === 'path-rules') return [...fixedRoots, ...otherJobRoots];
  const madeBeforeLaunch = deniedRootsMadeBeforeLaunchOf(facts);
  const existingFixedRoots = fixedRoots.filter((root) => madeBeforeLaunch.includes(root) || hostPaths.exists(root));
  const otherJobRootsRoom = Math.max(0, MOUNT_POINT_DENIED_WRITABLE_ROOTS_LIMIT - existingFixedRoots.length);
  return [...existingFixedRoots, ...otherJobRoots.filter(hostPaths.exists).slice(0, otherJobRootsRoom)];
}

/** No agent socket reaches a `mount-points` sandbox, as its runtime ignores `allowUnixSockets`, so a worker there commits unsigned. */
function commitSigningUnder(facts: SandboxFacts): CommitSigning {
  return facts.sandboxDenyShape === 'mount-points' ? { kind: 'unsigned' } : facts.commitSigning;
}

/**
 * The monitor's `private` folder holds the API token, every socket and every secret, and exists before any worker starts, so a file that appears
 * in it later is covered on every OS. Under `path-rules` the launch files are named by a glob, which the sandbox and the permission rules
 * both read as one; under `mount-points` a glob covers only the files at launch, so the whole `jobs` folder is denied instead.
 */
function deniedReadableRootsOf(facts: SandboxFacts, hostPaths: HostPathCheck = REAL_HOST_PATHS): string[] {
  const credentialRoots = [join(facts.monitorFolder, PRIVATE_FOLDER_NAME), ...credentialRootsOf(facts, commitSigningUnder(facts))];
  if (facts.sandboxDenyShape === 'path-rules') return [join(facts.dataFolder, 'jobs', '*', 'launch-*.json'), ...credentialRoots];
  return [join(facts.dataFolder, 'jobs'), ...credentialRoots].filter(hostPaths.exists);
}

/** What a session outside a ticket's worktree is denied by: it commits unsigned, so GnuPG's home is denied whole. */
export type SessionDenyFacts = Pick<SandboxFacts, 'dataFolder' | 'monitorFolder' | 'credentialPaths' | 'gpgHomeDirectory' | 'sandboxDenyShape'>;

/** A session outside a ticket's worktree is denied Hephaestus's folder, every secret and every credential a worker is, nothing more. */
function sessionDeniedReadableRootsOf(facts: SessionDenyFacts, hostPaths: HostPathCheck = REAL_HOST_PATHS): string[] {
  const credentialRoots = credentialRootsOf(facts, { kind: 'unsigned' });
  return [
    hephaestusFilesIn(facts.dataFolder).hephaestusDirectory,
    join(facts.monitorFolder, PRIVATE_FOLDER_NAME),
    ...facts.sandboxDenyShape === 'path-rules' ? credentialRoots : credentialRoots.filter(hostPaths.exists),
  ];
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
 * Every prepare step and every gate of the catalogue, whatever phases run it, but a `forgeOnly` one, which only Hephaestus runs; the
 * ticket's own `network` line is added to the gates' domains. The lines are split in the grammar they run in, so a worker is granted what
 * they invoke and no more. A job of an entity takes its entity's steps and gates, none when the pipeline names no such entity.
 */
function workerToolchainOf(
  pipeline: Readonly<Pipeline> | null, ticketNetworkDomains: readonly string[], shellLine: Pick<ShellLine, 'executablesOf'>, entityKey?: EntityKey
): WorkerToolchain {
  const toolchainPipeline = pipeline === null || entityKey === undefined ? pipeline : PipelineUtil.pipelineOfEntity(pipeline, entityKey);
  const gates = (toolchainPipeline?.gates ?? []).filter((gate) => gate.forgeOnly !== true);
  const lines = [...(toolchainPipeline?.prepare ?? []).map((step) => step.run), ...gates.map((gate) => gate.run)];
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

/**
 * The main checkout's folders from just above a checkout nested in it up to the repository root. None for a tracker at its repository's
 * root, or for a checkout outside the repository: what such a session reads stays as it always was.
 */
function nestedCheckoutAncestorsOf(repositoryRoot: string, checkout: string, projectPrefix: string): string[] {
  const placeInRepository = relative(repositoryRoot, checkout);
  if (projectPrefix === '' || placeInRepository === '' || placeInRepository.startsWith('..') || isAbsolute(placeInRepository)) return [];
  const folders: string[] = [];
  for (let folder = dirname(checkout); folder !== repositoryRoot; folder = dirname(folder)) folders.push(folder);
  return [...folders, repositoryRoot];
}

/**
 * A session in a checkout nested in the main checkout writes the whole checkout, by file edits too, wherever in it the session started,
 * and reads the checkout's instruction files, never the main checkout's copies above it. A job's session starts at the checkout's root, where
 * the sandbox grants its git admin folder with no rule of forge's; a pipeline agent's snapshot starts in the project's folder of it.
 */
function nestedCheckoutProfileOf(facts: Pick<SandboxFacts, 'repositoryRoot' | 'worktree' | 'projectPrefix'>): Pick<WorkerProfile, 'writeRoot' | 'nestedCheckoutAncestors'> {
  const projectPrefix = facts.projectPrefix ?? '';
  if (projectPrefix === '') return {};
  return { writeRoot: facts.worktree, nestedCheckoutAncestors: nestedCheckoutAncestorsOf(facts.repositoryRoot, facts.worktree, projectPrefix) };
}

/**
 * What a launch on a forge with entities adds to its sandbox facts: every entity's home, and the job's entity when it has one, with the
 * homes its stage 1 may write a proposal in.
 */
function entityFactsOf(
  pipeline: Readonly<Pipeline> | null, entityKey?: EntityKey, proposalHomes: readonly string[] = []
): Pick<SandboxFacts, 'entityHomes' | 'stageEntity'> {
  const entities = pipeline?.entities;
  if (entities === undefined) return {};
  const entityHomes = Object.values(entities).flatMap((entity) => entity.home);
  if (entityKey === undefined) return { entityHomes };
  return { entityHomes, stageEntity: { entities, entityKey, ...proposalHomes.length === 0 ? {} : { proposalHomes: [...proposalHomes] } } };
}

/** The names in a folder of the worktree at launch; none when it cannot be read. */
export interface FolderEntries {
  namesIn(path: string): readonly string[];
}

const REAL_FOLDER_ENTRIES: FolderEntries = Object.freeze({
  namesIn: (path: string) => {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },
});

function stageEntityOf({ entities, entityKey }: StageEntity): Readonly<PipelineEntity> | undefined {
  return Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
}

/**
 * The repository paths a stage's file edits reach, without a trailing `/`: the whole tree, `''`, for the root entity; else its homes and
 * `reach`, and in stage 1 the homes of the packages it may write a proposal in.
 */
function stageRepositoryPathsOf(stage: StageEntity): string[] {
  if (stage.entityKey === EntityOwnershipUtil.rootEntityKeyOf(stage.entities)) return [''];
  const entity = stageEntityOf(stage);
  return [...entity?.home ?? [], ...entity?.reach ?? [], ...stage.proposalHomes ?? []].map(EntityOwnershipUtil.homeFolderOf);
}

function pathIsBelow(folder: string, repositoryPath: string): boolean {
  return repositoryPath.startsWith(`${folder}/`);
}

/**
 * The repository paths outside a stage's own, each as high in the tree as it holds nothing the stage may change. Only the folders on the
 * way to a home or a `reach` path are read, their names at launch with the next folder of each such path. Those folders are never denied
 * themselves, so a name made after launch directly in one of them (the worktree root, `/apps`) is named by no rule: the stage edit guard
 * denies it.
 */
function deniedEditPathsOf(stage: StageEntity, worktree: string, folderEntries: FolderEntries): string[] {
  const { entities, entityKey } = stage;
  const ownPaths = stageRepositoryPathsOf(stage).filter((path) => path !== '');
  const otherHomes = Object.entries(entities).flatMap(([otherKey, entity]) => (otherKey === entityKey ? [] : entity.home.map(EntityOwnershipUtil.homeFolderOf)));
  const reachPaths = [...stageEntityOf(stage)?.reach ?? [], ...stage.proposalHomes ?? []].map(EntityOwnershipUtil.homeFolderOf);
  const reachCovers = (repositoryPath: string): boolean => reachPaths.some((reachPath) => repositoryPath === reachPath || pathIsBelow(reachPath, repositoryPath));
  const isEditable = (repositoryPath: string): boolean => reachCovers(repositoryPath) || EntityOwnershipUtil.ownerOf(entities, repositoryPath) === entityKey;
  const editabilityChangesBelow = (repositoryPath: string, editable: boolean): boolean => (editable
    ? otherHomes.some((home) => pathIsBelow(repositoryPath, home) && !isEditable(home))
    : ownPaths.some((ownPath) => pathIsBelow(repositoryPath, ownPath)));
  const deniedUnder = (folder: string): string[] => {
    const nextNames = [...ownPaths, ...otherHomes].filter((path) => pathIsBelow(folder, path)).map((path) => path.slice(folder.length + 1).split('/')[0] ?? '');
    const names = [...new Set([...folderEntries.namesIn(join(worktree, folder)), ...nextNames])].filter((name) => name !== '').sort();
    return names.flatMap((name) => {
      const child = `${folder}/${name}`;
      const editable = isEditable(child);
      if (editabilityChangesBelow(child, editable)) return deniedUnder(child);
      return editable ? [] : [child];
    });
  };
  return deniedUnder('');
}

/** The `hook stage-edits` guard of a stage (E18), which denies a file edit outside its folders, a name made after launch included. */
function stageEditGuardOf(stageFolders: readonly string[], guardCommand: readonly string[] | null): StageEditGuard {
  const [runtimePath, ...leadingArguments] = guardCommand ?? [];
  return {
    stageFolders: [...stageFolders],
    programPath:  runtimePath ?? null,
    arguments:    [...leadingArguments, 'hook', 'stage-edits', ...stageFolders.flatMap((folder) => ['--allow', folder])],
  };
}

/**
 * A job of an entity: file edits reach its stage's folders, every other path of the worktree at launch is denied them by a rule, and
 * the stage edit guard denies the rest, a name made later in a folder on the way to a stage's folder included.
 */
function stageEditProfileOf(
  facts: Pick<SandboxFacts, 'worktree' | 'stageEntity' | 'guardCommand'>, folderEntries: FolderEntries
): Pick<WorkerProfile, 'stageFolders' | 'deniedEditRoots' | 'stageEditGuard'> {
  if (facts.stageEntity === undefined) return {};
  const absolutePathOf = (repositoryPath: string): string => join(facts.worktree, repositoryPath);
  const stageFolders = stageRepositoryPathsOf(facts.stageEntity).map(absolutePathOf);
  return {
    stageFolders,
    deniedEditRoots: deniedEditPathsOf(facts.stageEntity, facts.worktree, folderEntries).map(absolutePathOf),
    stageEditGuard:  stageEditGuardOf(stageFolders, facts.guardCommand),
  };
}

function profileOf(
  role: ProfiledRole, facts: SandboxFacts, toolchain: WorkerToolchain, hostPaths: HostPathCheck = REAL_HOST_PATHS, folderEntries: FolderEntries = REAL_FOLDER_ENTRIES
): WorkerProfile {
  const isWorker = role === 'builder' || role === 'reviewer';
  const { networkDomains } = toolchain;
  const nestedCheckout = nestedCheckoutProfileOf(facts);
  const checkoutRoots = nestedCheckout.writeRoot === undefined ? [] : [nestedCheckout.writeRoot];
  return {
    writableRoots:          [...checkoutRoots, ...isWorker ? writableRootsOf(facts, toolchain.writes) : []],
    deniedWritableRoots:    deniedWritableRootsOf(facts, hostPaths),
    deniedReadableRoots:    deniedReadableRootsOf(facts, hostPaths),
    shellNetworkDomains:    isWorker ? [...networkDomains] : [],
    webNetworkDomains:      role === 'assistant' ? 'none' : webNetworkDomainsOf(role, networkDomains),
    extraWritableDirectory: facts.hatchDirectory,
    allowedCommandPrefixes: isWorker ? workerAllowedCommandPrefixesOf(toolchain.executables) : [],
    deniedCommandPrefixes:  isWorker ? WORKER_DENIED_GIT_SUBCOMMANDS.map((subcommand) => ['git', ...subcommand]) : [],
    askUser:                role !== 'assistant',
    skills:                 role === PRODUCT_OWNER_ROLE,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       facts.repositoryRoot,
    ...nestedCheckout,
    ...stageEditProfileOf(facts, folderEntries),
    gitHooksDirectory:      facts.gitHooksDirectory,
    commitSigning:          commitSigningUnder(facts),
    networkDomainGuard:     isWorker ? networkDomainGuardOf(networkDomains, facts.guardCommand) : null,
  };
}

/** The `hook bash-domains` guard of design section 4.4, for a worker whose ticket has a `network` line; none without one. */
function networkDomainGuardOf(networkDomains: readonly string[], guardCommand: readonly string[] | null): NetworkDomainGuard | null {
  if (networkDomains.length === 0) return null;
  const [runtimePath, ...leadingArguments] = guardCommand ?? [];
  return {
    allowedDomains: [...networkDomains],
    programPath:    runtimePath ?? null,
    arguments:      [...leadingArguments, 'hook', 'bash-domains', '--allow', networkDomains.join(',')],
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
  repositoryRoot:                string;
  /** The tracker's project folder below the repository root; absent or `''` for a tracker at its repository's root. */
  projectPrefix?:                string;
  dataFolder:                    string;
  monitorFolder:                 string;
  homeDirectory:                 string;
  worktree:                      string;
  ownBranch:                     string;
  mainLine:                      string;
  branchNames:                   BranchNames;
  hatchDirectory:                string;
  executableSearchPath:          readonly string[];
  cacheFolderStyle:              CacheFolderStyle;
  sandboxDenyShape:              SandboxDenyShape;
  credentialPaths:               readonly string[];
  agentConfigurationFolderNames: readonly string[];
  guardCommand:                  readonly string[] | null;
}

const WORKTREE_BRANCH_LINE_PREFIX = 'branch refs/heads/';

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

/**
 * The branches a job's sandbox may not move: the board's other ticket branches and, for a namespaced board, every branch of another
 * namespace. A bare-named board denies only its ticket branches, as before namespaces.
 */
function otherBoardBranchesOf(branches: readonly string[], ownBranch: string, branchNames: BranchNames): string[] {
  return branches.filter((branch) => branch !== ownBranch && (branch.startsWith(branchNames.ticketBranchPrefix) || branchNames.branchIsInAnotherNamespace(branch)));
}

/** Read from git at launch: a ref or worktree created later is V14's to catch, never this list's. */
function sandboxFactsOf(request: SandboxFactsRequest, gpgDirectories: GpgDirectories | null = GpgDirectories.read(request.homeDirectory)): SandboxFacts {
  const commonGitDirectory = commonGitDirectoryOf(request.cacheFolderStyle, request.repositoryRoot);
  const branches = gitLinesOf(request.repositoryRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
  const worktreeListing = gitLinesOf(request.repositoryRoot, ['worktree', 'list', '--porcelain']);
  const { branchNames } = request;
  const ticketBranches = otherBoardBranchesOf(branches, request.ownBranch, branchNames);
  const adminFolders = otherWorktreeAdminFoldersOf(request.cacheFolderStyle, {
    commonGitDirectory,
    listedAdminFolders: worktreeListing
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length))
      .flatMap((path) => adminFolderOf(path) ?? []),
    ownAdminFolder: adminFolderOf(request.worktree),
  });
  return {
    dataFolder:                    request.dataFolder,
    monitorFolder:                 request.monitorFolder,
    homeDirectory:                 request.homeDirectory,
    worktree:                      request.worktree,
    commonGitDirectory,
    targetBranches:                [request.mainLine, ...branches.filter((branch) => branch.startsWith(branchNames.groupTargetPrefix))],
    otherTicketBranches:           request.sandboxDenyShape === 'path-rules' ? ticketBranches : liveBranchesOf(ticketBranches, worktreeListing),
    otherWorktreeAdminFolders:     adminFolders,
    hatchDirectory:                request.hatchDirectory,
    repositoryRoot:                request.repositoryRoot,
    ...(request.projectPrefix === undefined || request.projectPrefix === '' ? {} : { projectPrefix: request.projectPrefix }),
    gitHooksDirectory:             join(request.repositoryRoot, '.githooks'),
    commitSigning:                 commitSigningOf(gpgDirectories),
    credentialPaths:               request.credentialPaths,
    gpgHomeDirectory:              GpgDirectories.homeDirectoryOf(gpgDirectories, request.homeDirectory),
    executableSearchPath:          request.executableSearchPath,
    cacheFolderStyle:              request.cacheFolderStyle,
    sandboxDenyShape:              request.sandboxDenyShape,
    agentConfigurationFolderNames: request.agentConfigurationFolderNames,
    guardCommand:                  request.guardCommand,
  };
}

/**
 * The branches a worktree has checked out, where another job works; under `mount-points` only these are denied, each one a mount, and a
 * branch no worktree holds is V14's alone.
 */
function liveBranchesOf(branches: readonly string[], worktreeListing: readonly string[]): string[] {
  const checkedOut = new Set(worktreeListing.filter((line) => line.startsWith(WORKTREE_BRANCH_LINE_PREFIX)).map((line) => line.slice(WORKTREE_BRANCH_LINE_PREFIX.length)));
  return branches.filter((branch) => checkedOut.has(branch));
}

/** A session on a ticket's worktree takes the builder's profile as its builder, in the Airlock too, and the reviewer's in every review role. */
function workerRoleOf(jobRole: JobRole | null): Extract<ProfiledRole, 'builder' | 'reviewer'> {
  return jobRole === 'builder' ? 'builder' : 'reviewer';
}

export const WorkerProfiles = Object.freeze({
  profileOf,
  workerRoleOf,
  workerToolchainOf,
  entityFactsOf,
  deniedEditPathsOf,
  sandboxFactsOf,
  otherBoardBranchesOf,
  otherWorktreeAdminFoldersOf,
  fixedDeniedWritableRootsOf,
  deniedWritableRootsOf,
  deniedRootsMadeBeforeLaunchOf,
  unmadeDeniedRootOf,
  nestedCheckoutAncestorsOf,
  nestedCheckoutProfileOf,
  deniedReadableRootsOf,
  sessionDeniedReadableRootsOf,
  liveBranchesOf,
  commitSigningOf,
  unsignedCommitNoticeOf,
  networkDomainGuardOf,
  stageEditGuardOf,
});
