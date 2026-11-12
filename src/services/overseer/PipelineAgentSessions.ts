/**
 * The Overseer's side of a pipeline agent session: one detached snapshot of the main line per setup record, kept across the record's jobs and
 * checked out at the record's snapshot commit before each launch; a profile writing only its Hatch with no network; and Customs at each
 * turn end. A refusal marks the record's snapshot touched, which Apply refuses, and opens an incident. A snapshot that neither the open
 * record nor a live agent holds is removed.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import type { WorkerProfile }                                                             from '../../lib/agent-launch/WorkerProfile.ts';
import { type GitPathStyle }                                                              from '../../lib/git/GitPaths.ts';
import { GitProcess }                                                                     from '../../lib/git/GitProcess.ts';
import { GitWorktrees, REAL_WORKTREE_REMOVAL_PRIMITIVES, type WorktreeRemovalPrimitives } from '../../lib/git/GitWorktrees.ts';
import type { ShellLineGrammar }                                                          from '../../lib/shell-line/ShellLine.ts';
import type { Job }                                                                       from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineBilling }                                                           from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }                                                             from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                                                     from '../../lib/tracker-model/Board.ts';
import { WorktreesFolder }                                                                from '../../shared/WorktreesFolder.ts';
import {
  clearCustoms,
  launchSnapshotOf,
  refMovesAllowedOf,
  type CustomsVerdict,
  type LaunchSnapshot,
  type RefMovesAllowed
} from '../lifecycle/Customs.ts';
import type { PipelineAgentMode } from '../lifecycle/PipelineAgentProposal.ts';
import type { TrackerChange }     from '../tracker/TrackerPipeline.ts';
import type { Workspace }         from '../tracker/Workspace.ts';
import { GroupWorktrees }         from './GroupWorktrees.ts';
import { WatcherFleet }           from './WatcherFleet.ts';

const PIPELINE_AGENT_KIND = 'pipeline-agent';

/** Under the worktrees root, one detached snapshot per setup record; the Overseer owns it, so it is never a leftover worktree. */
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
  /** A group ticket's work goes to this prefix followed by its group's name: a landing that releases a group deletes that branch. */
  groupTargetPrefix: string;
  /** How a path compares with git's spelling, from the `DataFolders` port. */
  pathStyle:         GitPathStyle;
}

function isPipelineAgentJob(job: Readonly<Job>): boolean {
  return job.kind === PIPELINE_AGENT_KIND;
}

/** The open setup record the job serves; `null` for an `advise` job that no record names. */
function servedSetupOf(board: Board, job: Readonly<Job>): Readonly<PipelineSetup> | null {
  const setup = board.pipelineSetup();
  return setup !== null && setup.agentJobId === job.id ? setup : null;
}

/** A record's agents share the record's snapshot; an agent no record names has one of its own. */
function snapshotDirectoryOf(worktreesRoot: string, board: Board, job: Readonly<Job>): string {
  return join(worktreesRoot, PIPELINE_AGENT_SNAPSHOT_FOLDER, servedSetupOf(board, job)?.setupId ?? job.id);
}

/** The billing a pipeline agent launches under: its record's, which the setup chose before any pipeline exists. */
function launchBillingOf(board: Board, job: Readonly<Job>): PipelineBilling | undefined {
  return (isPipelineAgentJob(job) ? servedSetupOf(board, job)?.billing : undefined) ?? board.pipeline()?.billing;
}

/**
 * In the hold: a record whose agent has no snapshot commit yet takes main's tip, the commit its snapshot is made at. The read runs git only
 * until the record holds one.
 */
function pinSnapshotCommit(change: TrackerChange, mainLine: string): void {
  const setup = change.board.pipelineSetup();
  if (setup === null || setup.agentJobId === null || setup.snapshotCommit !== null || setup.applyRequest !== null) return;
  const mainTip = GitProcess.resolvedCommitOf(change.workspace.rootDirectory, mainLine);
  if (mainTip !== null) change.board.attachSetupAgent(setup.setupId, setup.agentJobId, mainTip);
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
    GitProcess.run(context.workspace.rootDirectory, ['worktree', 'add', '--quiet', '--detach', snapshot, snapshotCommit ?? context.mainLine]);
  }
  const startCommit = GitProcess.resolvedCommitOf(snapshot, 'HEAD', GitWorktrees.ceilingOf(snapshot));
  const launchSnapshot = launchSnapshotOf(snapshot);
  const jobFolder = WatcherFleet.jobFolderOf(context.workspace.trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  if (startCommit !== null && launchSnapshot !== null) writeFileSync(join(jobFolder, SNAPSHOT_START_FILE), `${JSON.stringify({ startCommit, launchSnapshot })}\n`);
  return snapshot;
}

function snapshotStartOf(trackerDirectory: string, jobId: string): SnapshotStart | null {
  try {
    return JSON.parse(readFileSync(join(WatcherFleet.jobFolderOf(trackerDirectory, jobId), SNAPSHOT_START_FILE), 'utf8')) as SnapshotStart;
  } catch {
    return null;
  }
}

/** What a pipeline agent's first message is filled from: `setup` for a first setup, `advise` on a stored pipeline, and the gate runs so far. */
export interface PipelineAgentFacts {
  mode:        PipelineAgentMode;
  gateHistory: string[];
  /** The grammar the proposed lines must be written in: the one they run in on this machine. */
  lineGrammar: ShellLineGrammar;
}

/** The newest gate runs `advise` reads its optimisations from. */
const GATE_HISTORY_RECORDS = 200;

function pipelineAgentFactsOf(board: Board, job: Readonly<Job>, lineGrammar: ShellLineGrammar): PipelineAgentFacts | null {
  if (!isPipelineAgentJob(job)) return null;
  const gateHistory = board.logRecordsSoFar()
    .flatMap((record) => (record.kind === 'gate-ran' ? [`${record.at} ${record.fields.outcome}${record.fields.cached ? ' (cached)' : ''} tree ${record.fields.tree}`] : []))
    .slice(-GATE_HISTORY_RECORDS);
  const setupMode = servedSetupOf(board, job)?.mode;
  const mode = setupMode === undefined ? (board.pipeline() === null ? 'setup' : 'advise') : (setupMode === 'setup' ? 'setup' : 'advise');
  return { mode, gateHistory, lineGrammar };
}

/** It reads the snapshot and writes only its Hatch folder; no network, no question, no skill. */
function pipelineAgentProfileOf(sessionProfile: WorkerProfile, hatchDirectory: string): WorkerProfile {
  return {
    ...sessionProfile, writableRoots: [hatchDirectory], bashNetworkDomains: [], webNetworkDomains: 'none', askUser: false, skills: false, networkDomainGuard: null
  };
}

/** The refs other jobs and the Overseer's own landings and refreshes move while the session runs, which V14 lets pass. */
function refMovesAllowedFor(context: TurnEndContext, board: Board, job: Readonly<Job>): RefMovesAllowed {
  const tickets = board.tickets();
  return refMovesAllowedOf(board.logRecordsSoFar(), {
    ownJobId:              job.id,
    ownBranch:             '',
    otherJobBranches:      board.jobs().flatMap((other) => (other.id === job.id || other.ticketIds[0] === undefined ? [] : [WorktreesFolder.ticketBranchOf(other.ticketIds[0])])),
    ticketBranchOf:        WorktreesFolder.ticketBranchOf,
    releasedGroupBranchOf: (ticketId) => {
      const frontmatter = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter;
      return frontmatter?.releasesGroup === true && frontmatter.group !== undefined ? `${context.groupTargetPrefix}${frontmatter.group}` : null;
    },
    refreshWorktreeOf: (groupBranch) => GroupWorktrees.refreshWorktreeOf(context.worktreesRoot, groupBranch),
  });
}

function turnEndVerdictOf(context: TurnEndContext, board: Board, job: Readonly<Job>): CustomsVerdict {
  const start = snapshotStartOf(context.workspace.trackerDirectory, job.id);
  if (start === null) return {
    verdict: 'refused', check: 'V16', reason: 'git-failed', facts: ['no snapshot start']
  };
  return clearCustoms({
    role:             'pipeline-agent',
    worktreePath:     snapshotDirectoryOf(context.worktreesRoot, board, job),
    startCommit:      start.startCommit,
    report:           undefined,
    ticketBody:       '',
    bodyHashAtLaunch: '',
    jobId:            job.id,
    logRecords:       board.logRecordsSoFar(),
    launchSnapshot:   start.launchSnapshot,
    refMovesAllowed:  refMovesAllowedFor(context, board, job),
    pathStyle:        context.pathStyle,
  });
}

/**
 * In the hold that reads each turn's `result`: Customs on the snapshot. A refusal marks the record's snapshot touched, so Apply refuses
 * `setup-snapshot-touched`, and opens one incident; a snapshot already touched, or an agent with an open incident, opens nothing again.
 */
function verifyTurnEnds(change: TrackerChange, context: TurnEndContext, jobIds: readonly string[]): void {
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
 * removed once per Overseer; one the removal leaves is named through `log` as a leftover. `removalPrimitives` paces the tries, which a
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
  for (const name of readdirSync(snapshotsFolder)) {
    const snapshot = join(snapshotsFolder, name);
    if (name === openSetupId || triedSnapshots.has(snapshot)) continue;
    triedSnapshots.add(snapshot);
    const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: context.workspace.rootDirectory, worktreePath: snapshot, force: 'force' }, removalPrimitives);
    if (removal.verdict === 'left') log(`The pipeline agent snapshot ${snapshot} is a leftover: ${removal.reason}`);
  }
}

export const PipelineAgentSessions = Object.freeze({
  isPipelineAgentJob,
  launchBillingOf,
  pinSnapshotCommit,
  prepareSnapshot,
  pipelineAgentProfileOf,
  pipelineAgentFactsOf,
  verifyTurnEnds,
  removeUnheldSnapshots,
});
