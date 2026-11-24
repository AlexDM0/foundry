/**
 * Hephaestus's side of a pipeline agent session: one detached snapshot of the main line per setup record, kept across the record's jobs and
 * checked out at the record's snapshot commit before each launch; a profile writing only its Hatch with no network; and Customs at each
 * turn end. A refusal marks the record's snapshot touched, which Apply refuses, and opens an incident. A snapshot that neither the open
 * record nor a live agent holds is removed. On a forge over entities the record has a session per entity beside the forge's, each
 * served from the record's one snapshot and stamped with its entity.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import type { AgentAdapter }                                                              from '../../lib/agent-launch/AgentAdapter.ts';
import type { WorkerProfile }                                                             from '../../lib/agent-launch/WorkerProfile.ts';
import { type GitPathStyle }                                                              from '../../lib/git/GitPaths.ts';
import { GitProcess }                                                                     from '../../lib/git/GitProcess.ts';
import { GitWorktrees, REAL_WORKTREE_REMOVAL_PRIMITIVES, type WorktreeRemovalPrimitives } from '../../lib/git/GitWorktrees.ts';
import type { ShellLineGrammar }                                                          from '../../lib/shell-line/ShellLine.ts';
import type { Job }                                                                       from '../../lib/tracker-model/@types/Job.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineAgent,
  PipelineBilling
} from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup, PipelineSetupMode } from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                            from '../../lib/tracker-model/Board.ts';
import type { BranchNames }                      from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                         from '../../shared/constants/ProductNames.ts';
import {
  clearCustoms,
  launchSnapshotOf,
  refMovesAllowedOf,
  sharedRepositoryRefsOf,
  watchedRefsOf,
  type AgentNaming,
  type CustomsVerdict,
  type LaunchSnapshot,
  type RefMovesAllowed
} from '../lifecycle/Customs.ts';
import type { SharedRepositoryLanding } from '../lifecycle/Landing.ts';
import type { BoardTransaction }        from '../tracker/BoardTransaction.ts';
import { projectLocationOf }            from '../tracker/ProjectLocation.ts';
import type { Workspace }               from '../tracker/Workspace.ts';
import { ConstitutionCommits }          from './ConstitutionCommits.ts';
import { GroupWorktrees }               from './GroupWorktrees.ts';
import { jobFolderIn }                  from './HephaestusFiles.ts';
import { CONSTITUTION_DEFAULT_PATH }    from './InstructionFiles.ts';

const PIPELINE_AGENT_KIND = 'pipeline-agent';

/** Under the worktrees root, one detached snapshot per setup record; Hephaestus owns it, so it is never a leftover worktree. */
export const PIPELINE_AGENT_SNAPSHOT_FOLDER = 'pipeline-agent';

const SNAPSHOT_START_FILE = 'pipeline-agent-start.json';

const SNAPSHOT_TOUCHED_INCIDENT = 'setup-snapshot-touched';

/** What a turn end's Customs holds the snapshot to: its HEAD and every ref when the job's current instance launched. */
interface SnapshotStart {
  startCommit:    string;
  launchSnapshot: LaunchSnapshot;
}

export interface SnapshotContext {
  workspace:     Workspace;
  worktreesRoot: string;
  mainLine:      string;
}

export interface TurnEndContext {
  workspace:         Workspace;
  worktreesRoot:     string;
  /** A group ticket's work goes to its group's branch: a landing that releases a group deletes that branch. */
  branchNames:       BranchNames;
  /** A namespaced tracker watches it beside its own namespace and worktrees. */
  mainLine:          string;
  /** How a path compares with git's spelling, from the `DataFolders` port. */
  pathStyle:         GitPathStyle;
  /** The agent's configuration names, which the snapshot's change may not touch, and its attribution. */
  agentNaming:       AgentNaming;
  /** Absent for a tracker at its repository's root, which shares no landing journal with siblings. */
  sharedRepository?: SharedRepositoryLanding;
}

function isPipelineAgentJob(job: Readonly<Job>): boolean {
  return job.kind === PIPELINE_AGENT_KIND;
}

/** The part of the open record a pipeline agent serves: the forge's own, or one entity's. */
export interface ServedLevel {
  setup:     Readonly<PipelineSetup>;
  /** Null for the forge's session. */
  entityKey: EntityKey | null;
}

/** The open record and the level whose session the job is; `null` for an `advise` job that no record names. */
function servedLevelOf(board: Board, jobId: string): ServedLevel | null {
  const setup = board.pipelineSetup();
  if (setup === null) return null;
  if (setup.agentJobId === jobId) return { setup, entityKey: null };
  const parts = setup.entities ?? {};
  const entityKey = Object.keys(parts).find((key) => parts[key]?.agentJobId === jobId);
  return entityKey === undefined ? null : { setup, entityKey };
}

/** The open setup record the job serves at any level; `null` for an `advise` job that no record names. */
function servedSetupOf(board: Board, job: Readonly<Job>): Readonly<PipelineSetup> | null {
  return servedLevelOf(board, job.id)?.setup ?? null;
}

/** The record's first session: the forge's, else the first entity's that has one; `null` while no session serves it. */
function firstSessionOf(setup: Readonly<PipelineSetup>): { agentJobId: string; entityKey: EntityKey | undefined } | null {
  if (setup.agentJobId !== null) return { agentJobId: setup.agentJobId, entityKey: undefined };
  for (const [entityKey, part] of Object.entries(setup.entities ?? {})) {
    if (part.agentJobId !== null) return { agentJobId: part.agentJobId, entityKey };
  }
  return null;
}

/** A record's agents share the record's snapshot; an agent no record names has one of its own. */
function snapshotDirectoryOf(worktreesRoot: string, board: Board, job: Readonly<Job>): string {
  return join(worktreesRoot, PIPELINE_AGENT_SNAPSHOT_FOLDER, servedSetupOf(board, job)?.setupId ?? job.id);
}

/** The agent a job launches on: a pipeline agent's record's, which the setup chose before any pipeline exists, else the forge's. */
function launchAgentOf(board: Board, job: Readonly<Job>): PipelineAgent | null {
  return (isPipelineAgentJob(job) ? servedSetupOf(board, job)?.agent : null) ?? board.agentOfForge();
}

/** The billing a pipeline agent launches under: its record's, which the setup chose before any pipeline exists. */
function launchBillingOf(board: Board, job: Readonly<Job>): PipelineBilling | undefined {
  return (isPipelineAgentJob(job) ? servedSetupOf(board, job)?.billing : undefined) ?? board.pipeline()?.billing;
}

/**
 * In the hold: a record whose agents have no snapshot commit yet takes main's tip, the commit its snapshot is made at. The read runs git
 * only until the record holds one.
 */
function pinSnapshotCommit(change: BoardTransaction, mainLine: string): void {
  const setup = change.board.pipelineSetup();
  const session = setup === null ? null : firstSessionOf(setup);
  if (setup === null || session === null || setup.snapshotCommit !== null || setup.applyRequest !== null) return;
  const mainTip = GitProcess.resolvedCommitOf(projectLocationOf(change.workspace.rootDirectory).repositoryRoot, mainLine);
  if (mainTip !== null) change.board.attachSetupAgent(setup.setupId, session.agentJobId, mainTip, session.entityKey);
}

/**
 * Before each launch of an instance: the snapshot exists at its record's snapshot commit, which a resume after main moved changed, and
 * HEAD and every ref are taken again, so a turn end compares only what this session could have moved.
 */
function prepareSnapshot(context: SnapshotContext, board: Board, job: Readonly<Job>): string {
  const snapshot = snapshotDirectoryOf(context.worktreesRoot, board, job);
  const snapshotCommit = servedSetupOf(board, job)?.snapshotCommit ?? null;
  if (existsSync(snapshot)) {
    const head = GitProcess.resolvedCommitOf(snapshot, 'HEAD', GitWorktrees.ceilingOf(snapshot));
    if (snapshotCommit !== null && head !== snapshotCommit) {
      GitProcess.run(snapshot, ['reset', '--hard', '--quiet', snapshotCommit], 'hooks-off', undefined, GitWorktrees.ceilingOf(snapshot));
    }
  } else {
    mkdirSync(join(context.worktreesRoot, PIPELINE_AGENT_SNAPSHOT_FOLDER), { recursive: true });
    const { repositoryRoot } = projectLocationOf(context.workspace.rootDirectory);
    GitProcess.run(repositoryRoot, ['worktree', 'add', '--quiet', '--detach', snapshot, snapshotCommit ?? context.mainLine]);
  }
  const startCommit = GitProcess.resolvedCommitOf(snapshot, 'HEAD', GitWorktrees.ceilingOf(snapshot));
  const launchSnapshot = launchSnapshotOf(snapshot);
  const jobFolder = jobFolderIn(context.workspace.trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  if (startCommit !== null && launchSnapshot !== null) writeFileSync(join(jobFolder, SNAPSHOT_START_FILE), `${JSON.stringify({ startCommit, launchSnapshot })}\n`);
  return snapshot;
}

function snapshotStartOf(trackerDirectory: string, jobId: string): SnapshotStart | null {
  try {
    return JSON.parse(readFileSync(join(jobFolderIn(trackerDirectory, jobId), SNAPSHOT_START_FILE), 'utf8')) as SnapshotStart;
  } catch {
    return null;
  }
}

/**
 * What a pipeline agent's first message is filled from: the record it serves, which a fresh session in place of a replaced one reads again,
 * and the stored pipeline and gate runs so far, which an agent no record names advises on.
 */
export interface PipelineAgentFacts {
  /** The record's mode; with no record, `setup` while no pipeline is stored and `advise` on a stored one. */
  mode:                  PipelineSetupMode;
  /** The line that runs the pipeline setup skill, as the agent adapter writes it; the first message starts with it. */
  firstLine:             string;
  /** Null for an agent no record names. */
  setup:                 Readonly<PipelineSetup> | null;
  /** The entity whose session this is, stamped by Hephaestus; null for the forge's session and for an agent no record names. */
  entity:                EntityKey | null;
  storedPipeline:        Readonly<Pipeline> | null;
  /** The installed default constitution, one of the sources the constitution is drafted from; null when the file is missing. */
  installedConstitution: string | null;
  gateHistory:           string[];
  /** The grammar the proposed lines must be written in: the one they run in on this machine. */
  lineGrammar:           ShellLineGrammar;
}

/** The newest gate runs `advise` reads its optimisations from. */
const GATE_HISTORY_RECORDS = 200;

function installedConstitutionOf(rootDirectory: string): string | null {
  try {
    return readFileSync(join(rootDirectory, CONSTITUTION_DEFAULT_PATH), 'utf8');
  } catch {
    return null;
  }
}

function pipelineAgentFactsOf(
  board: Board,
  job: Readonly<Job>,
  launch: { lineGrammar: ShellLineGrammar; rootDirectory: string; agentAdapter: Pick<AgentAdapter, 'instructionBundleLineOf'> },
): PipelineAgentFacts | null {
  if (!isPipelineAgentJob(job)) return null;
  const gateHistory = board.logRecordsSoFar()
    .flatMap((record) => (record.kind === 'gate-ran' ? [`${record.at} ${record.fields.outcome}${record.fields.cached ? ' (cached)' : ''} tree ${record.fields.tree}`] : []))
    .slice(-GATE_HISTORY_RECORDS);
  const served = servedLevelOf(board, job.id);
  const setup = served?.setup ?? null;
  const storedPipeline = board.pipeline();
  const mode = setup?.mode ?? (storedPipeline === null ? 'setup' : 'advise');
  return {
    mode,
    firstLine:             launch.agentAdapter.instructionBundleLineOf(PRODUCT_NAMES.PIPELINE_SETUP_SKILL, ''),
    setup,
    entity:                served?.entityKey ?? null,
    storedPipeline,
    installedConstitution: installedConstitutionOf(launch.rootDirectory),
    gateHistory,
    lineGrammar:           launch.lineGrammar,
  };
}

/** It reads the snapshot and writes only its Hatch folder; no network, no question. Its first line loads the pipeline setup skill, so skills stay on. */
function pipelineAgentProfileOf(sessionProfile: WorkerProfile, hatchDirectory: string): WorkerProfile {
  return {
    ...sessionProfile, writableRoots: [hatchDirectory], shellNetworkDomains: [], webNetworkDomains: 'none', askUser: false, skills: true, networkDomainGuard: null
  };
}

/**
 * The refs other jobs and Hephaestus's own landings and refreshes move while the session runs, which V14 lets pass; a namespaced tracker
 * also lets every ref outside its own pass, and a sibling's journaled landing.
 */
function turnEndRefMovesAllowedOf(context: TurnEndContext, board: Board, job: Readonly<Job>): RefMovesAllowed {
  const tickets = board.tickets();
  const { ticketBranchOf } = context.branchNames;
  return refMovesAllowedOf(board.logRecordsSoFar(), {
    ownJobId:              job.id,
    ownBranch:             '',
    otherJobBranches:      board.jobs().flatMap((other) => (other.id === job.id || other.ticketIds[0] === undefined ? [] : [ticketBranchOf(other.ticketIds[0])])),
    ticketBranchOf,
    releasedGroupBranchOf: (ticketId) => {
      const frontmatter = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter;
      return frontmatter?.releasesGroup === true && frontmatter.group !== undefined ? `${context.branchNames.groupTargetPrefix}${frontmatter.group}` : null;
    },
    refreshWorktreeOf:            (groupBranch) => GroupWorktrees.refreshWorktreeOf(context.worktreesRoot, groupBranch),
    constitutionCommitWorktreeOf: (jobId) => ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, jobId),
  }, sharedRepositoryRefsOf(context.sharedRepository?.files ?? null, watchedRefsOf(context.branchNames, context.mainLine, context.worktreesRoot)));
}

function turnEndVerdictOf(context: TurnEndContext, board: Board, job: Readonly<Job>): CustomsVerdict {
  const start = snapshotStartOf(context.workspace.trackerDirectory, job.id);
  if (start === null) return {
    verdict: 'refused', check: 'V16', reason: 'git-failed', facts: ['no snapshot start']
  };
  return clearCustoms({
    role:                'pipeline-agent',
    worktreePath:        snapshotDirectoryOf(context.worktreesRoot, board, job),
    startCommit:         start.startCommit,
    report:              undefined,
    ticketBody:          '',
    contentHashAtLaunch: '',
    ticketContentHash:   '',
    jobId:               job.id,
    logRecords:          board.logRecordsSoFar(),
    launchSnapshot:      start.launchSnapshot,
    refMovesAllowed:     turnEndRefMovesAllowedOf(context, board, job),
    pathStyle:           context.pathStyle,
    agentNaming:         context.agentNaming,
  });
}

/**
 * In the hold that reads each turn's `result`: Customs on the snapshot. A refusal marks the record's snapshot touched, so Apply refuses
 * `setup-snapshot-touched`, and opens one incident; a snapshot already touched, or an agent with an open incident, opens nothing again.
 */
function verifyTurnEnds(change: BoardTransaction, context: TurnEndContext, jobIds: readonly string[]): void {
  const { board, at } = change;
  for (const jobId of jobIds) {
    const job = board.jobById(jobId);
    if (job === undefined || !isPipelineAgentJob(job)) continue;
    const verdict = turnEndVerdictOf(context, board, job);
    if (verdict.verdict === 'verified') continue;
    const setup = servedSetupOf(board, job);
    if (setup !== null && board.setupSnapshotIsTouched(setup.setupId)) continue;
    if (board.incidents().some((incident) => incident.kind === SNAPSHOT_TOUCHED_INCIDENT && incident.jobId === job.id)) continue;
    if (setup !== null) board.recordSetupSnapshotTouched(setup.setupId, { check: verdict.check, reason: verdict.reason }, at);
    board.openIncident({
      kind:      SNAPSHOT_TOUCHED_INCIDENT,
      ticketIds: [],
      jobId:     job.id,
      facts:     {
        ...(setup === null ? {} : { setupId: setup.setupId }), check: verdict.check, reason: verdict.reason, paths: verdict.facts.join(', ')
      },
      defaultMove: 'incident-note',
    }, at);
  }
}

/**
 * After the hold: each snapshot that neither the open record nor a live pipeline agent holds, the record applied or started over, is
 * removed once per Hephaestus; one the removal leaves is named through `log` as a leftover. `removalPrimitives` paces the tries, which a
 * spec sets short.
 */
function removeUnheldSnapshots(
  board: Board,
  context: Pick<SnapshotContext, 'workspace' | 'worktreesRoot'>,
  triedSnapshots: Set<string>,
  log: (line: string) => void,
  removalPrimitives: WorktreeRemovalPrimitives = REAL_WORKTREE_REMOVAL_PRIMITIVES,
): void {
  const snapshotsFolder = join(context.worktreesRoot, PIPELINE_AGENT_SNAPSHOT_FOLDER);
  if (!existsSync(snapshotsFolder) || board.jobs().some(isPipelineAgentJob)) return;
  const openSetupId = board.pipelineSetup()?.setupId;
  const { repositoryRoot } = projectLocationOf(context.workspace.rootDirectory);
  for (const name of readdirSync(snapshotsFolder)) {
    const snapshot = join(snapshotsFolder, name);
    if (name === openSetupId || triedSnapshots.has(snapshot)) continue;
    triedSnapshots.add(snapshot);
    const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath: snapshot, force: 'force' }, removalPrimitives);
    if (removal.verdict === 'left') log(`The pipeline agent snapshot ${snapshot} is a leftover: ${removal.reason}`);
  }
}

export const PipelineAgentSessions = Object.freeze({
  isPipelineAgentJob,
  servedLevelOf,
  launchBillingOf,
  launchAgentOf,
  pinSnapshotCommit,
  prepareSnapshot,
  pipelineAgentProfileOf,
  pipelineAgentFactsOf,
  turnEndRefMovesAllowedOf,
  verifyTurnEnds,
  removeUnheldSnapshots,
});
