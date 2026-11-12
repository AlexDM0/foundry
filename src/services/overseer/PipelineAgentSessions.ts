/**
 * The Overseer's side of a pipeline agent job: a detached snapshot of the main line it reads, a profile writing only its Hatch with no network,
 * and the end of its pass. Once its Watcher is gone the pass is verified, a setup proposal's gates run twice on the snapshot and its caching is
 * checked, all outside the hold; the next hold opens `pipeline-proposal` with that record, or ends the job, and the snapshot is removed.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import type { AgentAdapter }                                                              from '../../lib/agent-launch/AgentAdapter.ts';
import type { WorkerProfile }                                                             from '../../lib/agent-launch/WorkerProfile.ts';
import type { ConfinedLine }                                                              from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                                                                     from '../../lib/git/GitProcess.ts';
import { GitWorktrees, REAL_WORKTREE_REMOVAL_PRIMITIVES, type WorktreeRemovalPrimitives } from '../../lib/git/GitWorktrees.ts';
import type { PlatformPorts }                                                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ShellLineGrammar }                                                          from '../../lib/shell-line/ShellLine.ts';
import type { Job }                                                                       from '../../lib/tracker-model/@types/Job.ts';
import type { DecisionDraft, DecisionWording }                                            from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                                                     from '../../lib/tracker-model/Board.ts';
import { CachingChecks }                                                                  from '../lifecycle/CachingChecks.ts';
import { launchSnapshotOf, clearCustoms, type LaunchSnapshot }                            from '../lifecycle/Customs.ts';
import type { GateConfinement }                                                           from '../lifecycle/GateRun.ts';
import {
  PipelineAgentProposal,
  type PipelineAgentMode,
  type PipelineAgentOutcome,
  type PipelineProposal
} from '../lifecycle/PipelineAgentProposal.ts';
import { ProposalTwiceRun }   from '../lifecycle/ProposalTwiceRun.ts';
import { TreePortability }    from '../lifecycle/TreePortability.ts';
import type { TrackerChange } from '../tracker/TrackerPipeline.ts';
import type { Workspace }     from '../tracker/Workspace.ts';
import { WatcherFleet }       from './WatcherFleet.ts';

const PIPELINE_AGENT_KIND = 'pipeline-agent';

/** Under the worktrees root, one detached snapshot per pipeline agent job; the Overseer owns it, so it is never a leftover worktree. */
export const PIPELINE_AGENT_SNAPSHOT_FOLDER = 'pipeline-agent';

const SNAPSHOT_START_FILE = 'pipeline-agent-start.json';

interface SnapshotStart {
  startCommit:    string;
  launchSnapshot: LaunchSnapshot;
}

export interface PipelineAgentContext {
  platformPorts:         PlatformPorts;
  workspace:             Workspace;
  worktreesRoot:         string;
  mainLine:              string;
  agentAdapter:          AgentAdapter;
  gateEnvironment:       Readonly<Record<string, string>>;
  /** A proposed line under the confinement a merge gate runs in, in the snapshot at `directory`. */
  confinedLineOf:        (directory: string, commandArguments: readonly string[], confinement: GateConfinement) => ConfinedLine;
  /** A clock exception: the twice-run only records each gate's duration. */
  millisecondsNow:       () => number;
  stopGraceMilliseconds: number;
}

type ProposalRunContext = Pick<PipelineAgentContext, 'platformPorts' | 'gateEnvironment' | 'confinedLineOf' | 'millisecondsNow'>;

function isPipelineAgentJob(job: Readonly<Job>): boolean {
  return job.kind === PIPELINE_AGENT_KIND;
}

function snapshotDirectoryOf(worktreesRoot: string, jobId: string): string {
  return join(worktreesRoot, PIPELINE_AGENT_SNAPSHOT_FOLDER, jobId);
}

/** Taken once, at the main line's tip: every ref and HEAD then, which Customs holds the pass to. */
function prepareSnapshot(context: Pick<PipelineAgentContext, 'workspace' | 'worktreesRoot' | 'mainLine'>, job: Readonly<Job>): string {
  const snapshot = snapshotDirectoryOf(context.worktreesRoot, job.id);
  if (existsSync(snapshot)) return snapshot;
  mkdirSync(join(context.worktreesRoot, PIPELINE_AGENT_SNAPSHOT_FOLDER), { recursive: true });
  GitProcess.run(context.workspace.rootDirectory, ['worktree', 'add', '--detach', snapshot, context.mainLine]);
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

/** What a pipeline agent's first message is filled from: `setup` with no pipeline, `advise` with one, and the gate runs logged so far. */
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
  return { mode: board.pipeline() === null ? 'setup' : 'advise', gateHistory, lineGrammar };
}

/** It reads the snapshot and writes only its Hatch folder; no network, no question, no skill. */
function pipelineAgentProfileOf(sessionProfile: WorkerProfile, hatchDirectory: string): WorkerProfile {
  return {
    ...sessionProfile, writableRoots: [hatchDirectory], bashNetworkDomains: [], webNetworkDomains: 'none', askUser: false, skills: false, networkDomainGuard: null
  };
}

function reportOf(context: PipelineAgentContext, job: Readonly<Job>): unknown {
  const jobFolder = WatcherFleet.jobFolderOf(context.workspace.trackerDirectory, job.id);
  let report: unknown = undefined;
  for (let instance = 1; instance <= job.watcherInstance; instance += 1) {
    const entries = WatcherFleet.eventsAfter(jobFolder, instance, 0);
    if (entries === 'malformed') continue;
    for (const entry of entries.filter((logged) => logged.origin === 'agent')) {
      for (const event of context.agentAdapter.eventsOf(entry.line)) if (event.kind === 'result') report = event.structuredReport;
    }
  }
  return report;
}

/** The proposal's lines, twice on the snapshot, each under the confinement a merge gate gets and in the gates' narrowed environment. */
async function proposalOutcomeOf(context: ProposalRunContext, proposal: PipelineProposal, snapshot: string, snapshotCommit: string): Promise<PipelineAgentOutcome> {
  const runRecord = await ProposalTwiceRun.runProposalTwice({
    shellLine:       context.platformPorts.shellLine,
    prepare:         proposal.prepare,
    gates:           proposal.gates,
    directory:       snapshot,
    snapshotCommit,
    millisecondsNow: context.millisecondsNow,
    environment:     context.gateEnvironment,
    spawnOptions:    context.platformPorts.processSupervision.spawnOptionsFor('gate'),
    confinedLineOf:  (commandArguments, confinement) => context.confinedLineOf(snapshot, commandArguments, confinement),
  });
  if ('verdict' in runRecord) return runRecord;
  return {
    verdict:            'proposed',
    proposal,
    runRecord,
    cachingSuggestions: CachingChecks.cachingSuggestionsOf(snapshot, proposal.gates, runRecord),
    treeFindings:       TreePortability.treeFindingsAt(snapshot, 'HEAD'),
  };
}

/** A refused pass names them too: a case collision alone leaves the snapshot dirty on a case-insensitive file system, which Customs refuses. */
function withTreeFindingFacts(outcome: Extract<PipelineAgentOutcome, { verdict: 'refused' }>, snapshot: string): PipelineAgentOutcome {
  const findingFacts = TreePortability.treeFindingsAt(snapshot, 'HEAD').map((finding) => `${finding.kind}: ${finding.paths.join(', ')}`);
  return findingFacts.length === 0 ? outcome : { ...outcome, facts: [...outcome.facts, ...findingFacts] };
}

async function settledOutcomeOf(context: PipelineAgentContext, board: Board, job: Readonly<Job>): Promise<PipelineAgentOutcome> {
  const snapshot = snapshotDirectoryOf(context.worktreesRoot, job.id);
  const start = snapshotStartOf(context.workspace.trackerDirectory, job.id);
  if (start === null) return {
    verdict: 'refused', check: 'V16', reason: 'git-failed', facts: ['no snapshot start']
  };
  const report = reportOf(context, job);
  const verdict = clearCustoms({
    role:             'pipeline-agent',
    worktreePath:     snapshot,
    startCommit:      start.startCommit,
    report,
    ticketBody:       '',
    bodyHashAtLaunch: '',
    jobId:            job.id,
    logRecords:       board.logRecordsSoFar(),
    launchSnapshot:   start.launchSnapshot,
    refMovesAllowed:  {
      ownBranch: '', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], refreshWorktreeHeads: []
    },
    pathStyle: context.platformPorts.dataFolders,
  });
  if (verdict.verdict === 'refused') return withTreeFindingFacts(verdict, snapshot);
  const proposal = PipelineAgentProposal.proposalOf(report);
  if (proposal.mode === 'advise') return { verdict: 'advised' };
  return proposalOutcomeOf(context, proposal, snapshot, start.startCommit);
}

/** Outside the hold, since gates take minutes: each pipeline agent that reported (`in-customs`) and is not settled yet; its session is stopped first. */
async function settleEndedPipelineAgents(context: PipelineAgentContext, board: Board): Promise<number> {
  let settled = 0;
  for (const job of board.jobs().filter(isPipelineAgentJob)) {
    if (job.state !== 'in-customs') continue;
    if (PipelineAgentProposal.storedOutcomeOf(context.workspace.trackerDirectory, job.id) !== null) continue;
    await WatcherFleet.sendFrames(context.platformPorts, WatcherFleet.jobFolderOf(context.workspace.trackerDirectory, job.id), job.watcherInstance, [
      { kind: 'stop', graceMilliseconds: context.stopGraceMilliseconds },
    ]);
    PipelineAgentProposal.storeOutcome(context.workspace.trackerDirectory, job.id, await settledOutcomeOf(context, board, job));
    settled += 1;
  }
  return settled;
}

function endingOf(outcome: PipelineAgentOutcome): Parameters<Board['endJob']>[1] {
  if (outcome.verdict === 'refused') return { outcome: 'failed', cause: outcome.reason };
  return outcome.verdict === 'sandbox-unavailable' ? { outcome: 'failed', cause: outcome.verdict } : { outcome: 'closed' };
}

/**
 * In the hold: a proposal opens `pipeline-proposal` naming the job, whose answer reads it; a refused line its incident; every settled pass ends.
 * `removalPrimitives` paces the snapshot removal's tries, which a spec sets short.
 */
function applySettledPipelineAgents(
  change: TrackerChange,
  worktreesRoot: string,
  decisionWordingOf: (draft: DecisionDraft) => DecisionWording,
  removalPrimitives: WorktreeRemovalPrimitives = REAL_WORKTREE_REMOVAL_PRIMITIVES,
): void {
  for (const job of change.board.jobs().filter(isPipelineAgentJob)) {
    const outcome = PipelineAgentProposal.storedOutcomeOf(change.workspace.trackerDirectory, job.id);
    if (outcome === null) continue;
    if (outcome.verdict === 'sandbox-unavailable') {
      change.board.openIncident({
        kind: 'sandbox-unavailable', ticketIds: job.ticketIds, jobId: job.id, facts: { step: 'proposal', reason: outcome.reason }, defaultMove: 'gate-retry'
      }, change.at);
    }
    if (outcome.verdict === 'proposed') {
      const draft: DecisionDraft = {
        kind: 'pipeline-proposal', ticketIds: [], jobId: job.id, pipelineProposal: PipelineAgentProposal.proposalFactsOf(outcome)
      };
      change.board.openDecision({
        ...draft, askedBy: 'overseer', requestId: null, ...decisionWordingOf(draft)
      }, change.at);
    }
    change.board.endJob(job.id, endingOf(outcome), change.at);
    removeSnapshot(change, snapshotDirectoryOf(worktreesRoot, job.id), removalPrimitives);
  }
}

/** Forced, since a snapshot holds only what its gates wrote; one that stays is a leftover the log names. */
function removeSnapshot(change: TrackerChange, snapshot: string, removalPrimitives: WorktreeRemovalPrimitives): void {
  const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: change.workspace.rootDirectory, worktreePath: snapshot, force: 'force' }, removalPrimitives);
  if (removal.verdict === 'left') change.board.recordNote(`The pipeline agent snapshot ${snapshot} is a leftover: ${removal.reason}`, change.at);
}

export const PipelineAgentSessions = Object.freeze({
  isPipelineAgentJob, prepareSnapshot, pipelineAgentProfileOf, pipelineAgentFactsOf, proposalOutcomeOf, settleEndedPipelineAgents, applySettledPipelineAgents
});
