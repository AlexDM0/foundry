/**
 * The folders of a repository and one worktree per ticket branch, with no git in them, and a fixture Board whose holds run in place, around
 * `createAirlocks`: the spec's recorded git answers stand for the history, and the gate, the merge agent's reading and its Watcher's
 * liveness are the spec's to set. Test-only.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import type { GatePhase }                     from '../../../lib/tracker-model/@types/GatePhase.ts';
import type { Job }                           from '../../../lib/tracker-model/@types/Job.ts';
import type { PipelineAirlock }               from '../../../lib/tracker-model/@types/Pipeline.ts';
import type { MainConstitutionReading }       from '../../../lib/tracker-model/@types/PipelineSetup.ts';
import type { TicketPriority }                from '../../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                         from '../../../lib/tracker-model/Board.ts';
import { branchNamesOf }                      from '../../../shared/BranchNames.ts';
import { AIRLOCK_LIMITS, type AirlockLimits } from '../../../shared/constants/AirlockLimits.ts';
import { boardFixture, ticketFixture }        from '../../../testing/BoardFixtures.ts';
import { queueOnCurrentGreen }                from '../../../testing/GreenQueue.ts';
import { createPlantedRepository }            from '../../../testing/RecordedAirlockGit.ts';
import { removeScratchDirectory }             from '../../../testing/ScratchWorkspace.ts';
import {
  createAirlocks,
  type DeclinedCleanup,
  type MergeAgentReading,
  type MergedTreeGate,
  type Airlocks
} from '../Airlocks.ts';
import { GroupWorktrees } from '../GroupWorktrees.ts';

export const HARNESS_AT = '2026-10-28T10:00:00+01:00';

/** Every Acceptance item accounted for, so a landing's ticket checks pass unless a spec says otherwise. */
export const ACCOUNTED_BODY = '## Acceptance\n\nA1. Example cart totals add up.\n\n## Review\n\n- A1 holds — Example probe.\n';

export interface HarnessTicket {
  id:             string;
  priority?:      TicketPriority;
  body?:          string;
  /** A group ticket's branch forks off `group-<group>`, whose worktree folder the harness makes. */
  group?:         string;
  releasesGroup?: true;
  dependsOn?:     string[];
  /** `in-review` and queued unless set; a ticket of the bundle already integrated is `reviewed`; a `pending` one is not built yet. */
  status?:        'pending' | 'in-review' | 'reviewed';
}

export interface AirlocksHarness {
  repository:       string;
  board:            Board;
  slots:            Airlocks;
  /** The slot phase each hold left on the main line's merge job, in hold order. */
  phases:           string[];
  gatedTrees:       string[];
  /** The phase each gated tree was gated in, in the order of `gatedTrees`. */
  gatedPhases:      GatePhase[];
  stopped:          string[];
  /** Every removal git declined after a refresh or a release, as the Overseer was told. */
  declinedCleanups: DeclinedCleanup[];
  /** The facts each merge job's Airlock incident left for the agent it launches, by merge job id. */
  keptAirlockFacts: Map<string, Readonly<Record<string, string>>>;
  settings:    {
    gateOutcome:       MergedTreeGate['outcome'];
    reading:           MergeAgentReading;
    /** The lines a resolution changed, as git counts them; `null` when git cannot tell. */
    resolutionLines:   number | null;
    watcherIsLive:     boolean;
    refDeniesHold:     boolean;
    /** Runs before each gate returns, after it read its stamp: a spec moves the main line or edits the pipeline here. */
    beforeGate:        () => void;
    /** Main's `CONSTITUTION.md` as git would answer for the main line's tip; absent unless set. */
    mainConstitution:  MainConstitutionReading;
    /** The repository sets `commit.gpgsign`; false unless set. */
    signsCommits:      boolean;
    /** The board is paused: no ticket's slot opens; false unless set. */
    dispatchIsStopped: boolean;
  };
  worktreeOf:   (ticketId: string) => string;
  tipOf:        (branch: string) => string;
  /** The tree of the ticket's branch HEAD, as the Airlocks read it. */
  branchTreeOf: (ticketId: string) => string;
  mergeJob:     () => Readonly<Job> | undefined;
  mergeAgent:   () => Readonly<Job> | undefined;
  remove:       () => void;
}

/** The ids a harness planted with no git stands at; a spec's recorded answers fill them in. */
export const RECORDED_AIRLOCK_IDS = {
  MAIN_TIP:    '1'.repeat(40),
  TICKET_TIP:  '3'.repeat(40),
  GROUP_TIP:   '5'.repeat(40),
  MERGED_TIP:  '7'.repeat(40),
  TICKET_TREE: 'a'.repeat(40),
  MERGED_TREE: 'b'.repeat(40),
} as const;

/** The branch a planted ticket, the main line or a group stands at. */
function plantedTipOf(branch: string): string {
  if (branch.startsWith('group-')) return RECORDED_AIRLOCK_IDS.GROUP_TIP;
  return branch === 'main' ? RECORDED_AIRLOCK_IDS.MAIN_TIP : RECORDED_AIRLOCK_IDS.TICKET_TIP;
}

/**
 * The harness on folders with no git: every ticket's branch stands at `RECORDED_AIRLOCK_IDS.TICKET_TIP` with the tree `TICKET_TREE`, the
 * main line at `MAIN_TIP` and a group branch at `GROUP_TIP`, and the spec answers each git call the Airlocks ask from recorded answers.
 * The repository holds the `.git` folder a recorded common-folder answer names. `airlock` is the pipeline's merge train, absent unless set.
 */
export function createRecordedAirlocksHarness(
  tickets: readonly HarnessTicket[],
  limits: Partial<AirlockLimits> = {},
  hasReviewPhase = true,
  airlock: PipelineAirlock | null = null,
): AirlocksHarness {
  const repository = createPlantedRepository('airlocks');
  const worktreesRoot = `${repository}-worktrees`;
  for (const ticket of tickets) {
    mkdirSync(join(worktreesRoot, `ticket-${ticket.id}`), { recursive: true });
    if (ticket.group !== undefined) mkdirSync(GroupWorktrees.groupWorktreeOf(worktreesRoot, `group-${ticket.group}`), { recursive: true });
  }
  const branchTreeOf = (_ticketId: string): string => RECORDED_AIRLOCK_IDS.TICKET_TREE;
  const worktreeOf = (ticketId: string): string => join(worktreesRoot, `ticket-${ticketId}`);
  const { board } = boardFixture({
    pipeline: {
      version: 3,
      prepare: [],
      gates:   [],
      phases:  { build: [], review: [], merge: [] },
      ...hasReviewPhase ? { review: { name: 'Review' } } : {},
      ...airlock === null ? {} : { airlock },
    },
    tickets: tickets.map((ticket) => ({
      ...ticketFixture({
        id:     ticket.id,
        status: ticket.status ?? 'in-review',
        ...(ticket.priority === undefined ? {} : { priority: ticket.priority }),
        ...(ticket.group === undefined ? {} : { group: ticket.group }),
        ...(ticket.releasesGroup === undefined ? {} : { releasesGroup: ticket.releasesGroup }),
        ...(ticket.dependsOn === undefined ? {} : { dependsOn: ticket.dependsOn }),
      }),
      body: ticket.body ?? ACCOUNTED_BODY,
    })),
  });
  for (const ticket of tickets.filter((each) => each.status === undefined)) queueOnCurrentGreen(board, ticket.id, 'main', HARNESS_AT, branchTreeOf(ticket.id));

  const phases: string[] = [];
  const gatedTrees: string[] = [];
  const gatedPhases: GatePhase[] = [];
  const stopped: string[] = [];
  const declinedCleanups: DeclinedCleanup[] = [];
  const keptAirlockFacts = new Map<string, Readonly<Record<string, string>>>();
  const settings: AirlocksHarness['settings'] = {
    gateOutcome:       'passed',
    reading:           { calls: 0, report: undefined },
    resolutionLines:   0,
    watcherIsLive:     false,
    refDeniesHold:     true,
    beforeGate:        () => undefined,
    mainConstitution:  { verdict: 'absent' },
    signsCommits:      false,
    dispatchIsStopped: false,
  };
  const mergeJob = (): Readonly<Job> | undefined => board.airlockHolderOf('main');
  const slots = createAirlocks({
    repositoryRoot: repository,
    mainLine:       'main',
    branchNames:    branchNamesOf(null),
    worktreesRoot,
    worktreeOf,
    limits:         { ...AIRLOCK_LIMITS, ...limits },
    get refDeniesHold() {
      return settings.refDeniesHold;
    },
    hold: (mutate) => {
      const result = mutate({ board, at: HARNESS_AT });
      const phase = mergeJob()?.airlock?.phase;
      if (phase !== undefined && phases.at(-1) !== phase) phases.push(phase);
      return Promise.resolve(result);
    },
    gateMergedTree: (_worktreePath, treeId, phase) => {
      gatedTrees.push(treeId);
      gatedPhases.push(phase);
      const stamp = board.gateRunStampOf(phase);
      settings.beforeGate();
      return Promise.resolve({
        outcome: settings.gateOutcome, step: settings.gateOutcome === 'passed' ? null : 'tests', output: 'Example gate output\nexpected 2, received 3', stamp
      });
    },
    mergeAgentReadingOf: () => settings.reading,
    resolutionLinesOf:   () => settings.resolutionLines,
    watcherIsLive:       () => settings.watcherIsLive,
    stopMergeAgent:      (job) => {
      stopped.push(job.id);
      return Promise.resolve();
    },
    decisionWordingOf: () => ({
      questions: [{
        question: 'Example?', header: 'Example', multiSelect: false, options: []
      }],
      context: ''
    }),
    keepAirlockFacts:       (mergeJob, facts) => keptAirlockFacts.set(mergeJob.id, facts),
    jobFolderOf:            (job) => join(repository, '.example-tracker', 'jobs', job.id),
    jobFolderOfId:          (jobId) => join(repository, '.example-tracker', 'jobs', jobId),
    redHandoffResumes:      2,
    dispatchIsStopped:      () => settings.dispatchIsStopped,
    reportDeclinedCleanup:  (declined) => declinedCleanups.push(declined),
    mainConstitutionOf:     () => settings.mainConstitution,
    repositorySignsCommits: () => settings.signsCommits,
  });
  return {
    repository,
    board,
    slots,
    phases,
    gatedTrees,
    gatedPhases,
    stopped,
    declinedCleanups,
    keptAirlockFacts,
    settings,
    worktreeOf,
    tipOf:      plantedTipOf,
    branchTreeOf,
    mergeJob,
    mergeAgent: () => board.jobs().find((job) => job.kind === 'merge-agent'),
    remove:     () => {
      removeScratchDirectory(`${repository}-worktrees`);
      removeScratchDirectory(repository);
    },
  };
}

export function finishMergeAgent(harness: AirlocksHarness, report: Record<string, unknown>): void {
  const agent = harness.mergeAgent();
  if (agent === undefined) throw new Error('No merge agent is live.');
  // A fixer interrupted on its red merged tree is resumed first, as the lifecycle's `resume-job` step does.
  if (agent.state === 'launching' || agent.state === 'interrupted') harness.board.moveJob(agent.id, 'running', HARNESS_AT);
  harness.board.moveJob(agent.id, 'in-customs', HARNESS_AT);
  harness.settings.reading = { calls: 3, report };
}
