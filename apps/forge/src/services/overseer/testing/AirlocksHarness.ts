/**
 * The folders of a repository and one worktree per ticket branch, with no git in them, and a fixture Board whose holds run in place, around
 * `createAirlocks`: the spec's recorded git answers stand for the history, and the gate, the merge agent's reading and its Watcher's
 * liveness are the spec's to set. Test-only.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { RepositoryLandings }                        from '../../../lib/git/RepositoryLandings.ts';
import type { GatePhase }                            from '../../../lib/tracker-model/@types/GatePhase.ts';
import type { GateRunCacheReports, Job }             from '../../../lib/tracker-model/@types/Job.ts';
import type { EntityKey, Pipeline, PipelineAirlock } from '../../../lib/tracker-model/@types/Pipeline.ts';
import type { MainConstitutionReading }              from '../../../lib/tracker-model/@types/PipelineSetup.ts';
import type { TicketPriority }                       from '../../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                                from '../../../lib/tracker-model/Board.ts';
import { PipelineUtil }                              from '../../../lib/tracker-model/utils/PipelineUtil.ts';
import { branchNamesOf }                             from '../../../shared/BranchNames.ts';
import { AIRLOCK_LIMITS, type AirlockLimits }        from '../../../shared/constants/AirlockLimits.ts';
import { PRODUCT_NAMES }                             from '../../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }               from '../../../testing/BoardFixtures.ts';
import { queueOnCurrentGreen }                       from '../../../testing/GreenQueue.ts';
import { createPlantedRepository }                   from '../../../testing/RecordedAirlockGit.ts';
import { removeScratchDirectory }                    from '../../../testing/ScratchWorkspace.ts';
import type { ProjectScope }                         from '../../lifecycle/Customs.ts';
import type { SharedRepositoryLanding }              from '../../lifecycle/Landing.ts';
import {
  createAirlocks,
  type DeclinedCleanup,
  type MergeAgentReading,
  type MergedTreeGate,
  type Airlocks
} from '../Airlocks.ts';
import { GroupWorktrees } from '../GroupWorktrees.ts';

export const HARNESS_AT = '2026-10-28T10:00:00+01:00';

/** The tracker a harness beside its siblings lands as. */
export const HARNESS_TRACKER_ID = 'tracker-example-forge';

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
  /** The ticket's entity on a pipeline with entities, whose review green queues it. */
  entity?:        EntityKey;
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
  /** The entities whose gates each gated tree was to run, in the order of `gatedTrees`; `undefined` where the Airlocks named none. */
  gatedEntities:    (readonly EntityKey[] | undefined)[];
  stopped:          string[];
  /** The landing the tracker shares with its siblings, in the repository's `.git` folder; `null` for a tracker at the root. */
  sharedRepository: SharedRepositoryLanding | null;
  /** Every removal git declined after a refresh or a release, as the Overseer was told. */
  declinedCleanups: DeclinedCleanup[];
  /** The facts each merge job's Airlock incident left for the agent it launches, by merge job id. */
  keptAirlockFacts: Map<string, Readonly<Record<string, string>>>;
  settings:    {
    gateOutcome:             MergedTreeGate['outcome'];
    /** The red gate or the failed step a gate that does not pass names: `tests` unless set. */
    gateStep:                string;
    /** The entity a gate that does not pass names; absent unless set. */
    gateEntity?:             EntityKey;
    /** What the gates reported of their cache; absent unless set, as when no gate reported. */
    gateCacheReports?:       GateRunCacheReports;
    reading:                 MergeAgentReading;
    /** The lines a resolution changed, as git counts them; `null` when git cannot tell. */
    resolutionLines:         number | null;
    watcherIsLive:           boolean;
    refDeniesHold:           boolean;
    /** Runs before each gate returns, after it read its stamp: a spec moves the main line or edits the pipeline here. */
    beforeGate:              () => void;
    /** Main's `CONSTITUTION.md` as git would answer for the main line's tip; absent unless set. */
    mainConstitution:        MainConstitutionReading;
    /** Main's file at another constitution path, an entity's; read from `mainConstitution` unless set. */
    mainConstitutionAtPath?: (constitutionPath: string) => MainConstitutionReading;
    /** The repository sets `commit.gpgsign`; false unless set. */
    signsCommits:            boolean;
    /** The board is paused: no ticket's slot opens; false unless set. */
    dispatchIsStopped:       boolean;
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
 * The repository holds the `.git` folder a recorded common-folder answer names. `airlock` is the pipeline's merge train, absent unless set;
 * `besideSiblings` makes the tracker one in a project folder of the repository, whose landings it shares with its siblings, and
 * `projectScope` gives the Airlocks that folder and the pipeline its reach, so a conflict resolution is held to them. `entities` makes the
 * pipeline one with entities, each ticket queued on a review green of its own entity's gates.
 */
export function createRecordedAirlocksHarness(
  tickets: readonly HarnessTicket[],
  limits: Partial<AirlockLimits> = {},
  hasReviewPhase = true,
  airlock: PipelineAirlock | null = null,
  besideSiblings = false,
  projectScope: ProjectScope | null = null,
  entities: Pipeline['entities'] | null = null,
): AirlocksHarness {
  const repository = createPlantedRepository('airlocks');
  const sharedRepository: SharedRepositoryLanding | null = besideSiblings ? {
    trackerId:        HARNESS_TRACKER_ID,
    files:            RepositoryLandings.landingFilesOf(join(repository, '.git'), PRODUCT_NAMES.PROGRAM),
    now:              () => new Date(HARNESS_AT),
    lockHolderIsGone: () => false,
  } : null;
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
      ...projectScope === null ? {} : { reach: [...projectScope.reach] },
      ...entities === null ? {} : { entities },
    },
    tickets: tickets.map((ticket) => ({
      ...ticketFixture({
        id:     ticket.id,
        status: ticket.status ?? 'in-review',
        ...(ticket.priority === undefined ? {} : { priority: ticket.priority }),
        ...(ticket.group === undefined ? {} : { group: ticket.group }),
        ...(ticket.releasesGroup === undefined ? {} : { releasesGroup: ticket.releasesGroup }),
        ...(ticket.dependsOn === undefined ? {} : { dependsOn: ticket.dependsOn }),
        ...(ticket.entity === undefined ? {} : { entity: ticket.entity }),
      }),
      body: ticket.body ?? ACCOUNTED_BODY,
    })),
  });
  for (const ticket of tickets.filter((each) => each.status === undefined)) {
    const pipeline = board.pipeline();
    if (pipeline?.entities !== undefined) {
      const reviewStamp = PipelineUtil.entitiesGateRunStampOf(pipeline, 'review', ticket.entity === undefined ? [] : [ticket.entity]);
      board.recordPipelineJudgedBy(ticket.id, branchTreeOf(ticket.id), reviewStamp, HARNESS_AT);
      board.queueTicketForMerge(ticket.id, 'main', branchTreeOf(ticket.id), HARNESS_AT);
    } else queueOnCurrentGreen(board, ticket.id, 'main', HARNESS_AT, branchTreeOf(ticket.id));
  }

  const phases: string[] = [];
  const gatedTrees: string[] = [];
  const gatedPhases: GatePhase[] = [];
  const gatedEntities: (readonly EntityKey[] | undefined)[] = [];
  const stopped: string[] = [];
  const declinedCleanups: DeclinedCleanup[] = [];
  const keptAirlockFacts = new Map<string, Readonly<Record<string, string>>>();
  const settings: AirlocksHarness['settings'] = {
    gateOutcome:       'passed',
    gateStep:          'tests',
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
    gateMergedTree: (_worktreePath, treeId, phase, entityKeys) => {
      gatedTrees.push(treeId);
      gatedPhases.push(phase);
      gatedEntities.push(entityKeys);
      const pipeline = board.pipeline();
      const stamp = pipeline?.entities === undefined ? board.gateRunStampOf(phase) : PipelineUtil.entitiesGateRunStampOf(pipeline, phase, entityKeys ?? []);
      settings.beforeGate();
      return Promise.resolve({
        outcome: settings.gateOutcome,
        step:    settings.gateOutcome === 'passed' ? null : settings.gateStep,
        ...(settings.gateOutcome === 'passed' || settings.gateEntity === undefined ? {} : { entity: settings.gateEntity }),
        output:  'Example gate output\nexpected 2, received 3',
        stamp,
        ...(settings.gateCacheReports === undefined ? {} : { cacheReports: settings.gateCacheReports }),
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
    mainConstitutionOf:     (constitutionPath) => settings.mainConstitutionAtPath?.(constitutionPath) ?? settings.mainConstitution,
    repositorySignsCommits: () => settings.signsCommits,
    ...(sharedRepository === null ? {} : { sharedRepository }),
    ...(projectScope === null ? {} : { projectPrefix: projectScope.projectPrefix }),
  });
  return {
    repository,
    board,
    slots,
    sharedRepository,
    phases,
    gatedTrees,
    gatedPhases,
    gatedEntities,
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
