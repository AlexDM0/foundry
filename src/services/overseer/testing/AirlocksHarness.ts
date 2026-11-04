/**
 * A scratch repository with the main line checked out, one worktree per ticket branch, and a fixture Board whose holds run in place, around
 * `createAirlocks`: the gate, the merge agent's reading and its Watcher's liveness are the spec's to set. Test-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import type { Job }                           from '../../../lib/tracker-model/@types/Job.ts';
import type { TicketPriority }                from '../../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                         from '../../../lib/tracker-model/Board.ts';
import { AIRLOCK_LIMITS, type AirlockLimits } from '../../../shared/constants/AirlockLimits.ts';
import { boardFixture, ticketFixture }        from '../../../testing/BoardFixtures.ts';
import { queueOnCurrentGreen }                from '../../../testing/GreenQueue.ts';
import { plantedCommitOf, plantedTreeOf }     from '../../../testing/RecordedAirlockGit.ts';
import {
  commitFile as commitScratchFile,
  createScratchDirectory,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory
} from '../../../testing/ScratchWorkspace.ts';
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
  /** Committed on the ticket branch: `[file, content]`. */
  change:         [string, string];
  body?:          string;
  /** A group ticket's branch forks off `group-<group>`, whose worktree the harness makes from main's tip first. */
  group?:         string;
  releasesGroup?: true;
  dependsOn?:     string[];
  /** `in-review` and queued unless set; a ticket of the bundle already integrated is `reviewed`. */
  status?:        'in-review' | 'reviewed';
}

/** The git a harness plants its history with: real git in a scratch repository, or the git a spec passes. */
export interface HarnessGit {
  createRepository: (prefix: string) => string;
  outputOf:         (directory: string, gitArguments: readonly string[]) => string;
  commitFile:       (directory: string, fileName: string, content: string) => string;
}

const SCRATCH_REPOSITORY_GIT: HarnessGit = { createRepository: createScratchGitRepository, outputOf: gitOutputIn, commitFile: commitScratchFile };

const BRANCH_TREE_PATTERN = /^refs\/heads\/(?<branch>.+)\^\{tree\}$/;
const BRANCH_TIP_PATTERN = /^refs\/heads\/(?<branch>.+)$/;

/**
 * The git a harness plants with when the spec's git plays recorded answers: worktree folders, files and the planted ids of
 * `src/testing/RecordedAirlockGit.ts` in `repository`, made first by `createPlantedRepository`, so a stage can name its paths beforehand.
 */
export function plantedHarnessGitIn(repository: string): HarnessGit {
  return {
    createRepository: () => repository,
    outputOf:         (_directory, gitArguments) => {
      const [verb, ...rest] = gitArguments;
      if (verb === 'checkout') return '';
      if (verb === 'worktree' && rest[0] === 'add') {
        mkdirSync(rest.at(-2) ?? '', { recursive: true });
        return '';
      }
      const revision = verb === 'rev-parse' && rest.length === 1 ? rest[0] ?? '' : '';
      const treeBranch = BRANCH_TREE_PATTERN.exec(revision)?.groups?.['branch'];
      if (treeBranch !== undefined) return plantedTreeOf(treeBranch);
      const tipBranch = BRANCH_TIP_PATTERN.exec(revision)?.groups?.['branch'];
      if (tipBranch !== undefined) return plantedCommitOf(tipBranch);
      throw new Error(`the planted harness git plants nothing for git ${gitArguments.join(' ')}`);
    },
    commitFile: (directory, fileName, content) => {
      writeFileSync(join(directory, fileName), content);
      return plantedCommitOf(`${directory}:${fileName}`);
    },
  };
}

export interface AirlocksHarness {
  git:              HarnessGit;
  repository:       string;
  board:            Board;
  slots:            Airlocks;
  /** The slot phase each hold left on the main line's merge job, in hold order. */
  phases:           string[];
  gatedTrees:       string[];
  stopped:          string[];
  /** Every removal git declined after a refresh or a release, as the Overseer was told. */
  declinedCleanups: DeclinedCleanup[];
  /** The facts each merge job's Airlock incident left for the agent it launches, by merge job id. */
  keptAirlockFacts: Map<string, Readonly<Record<string, string>>>;
  settings:    {
    gateOutcome:   MergedTreeGate['outcome'];
    reading:       MergeAgentReading;
    watcherIsLive: boolean;
    refDeniesHold: boolean;
    /** Runs before each gate returns: a spec moves the main line here. */
    beforeGate:    () => void;
  };
  worktreeOf:   (ticketId: string) => string;
  tipOf:        (branch: string) => string;
  /** The tree of the ticket's branch HEAD, as the Airlocks read it. */
  branchTreeOf: (ticketId: string) => string;
  mergeJob:     () => Readonly<Job> | undefined;
  mergeAgent:   () => Readonly<Job> | undefined;
  remove:       () => void;
}

export function createAirlocksHarness(tickets: readonly HarnessTicket[], limits: Partial<AirlockLimits> = {}, hasReviewPhase = true): AirlocksHarness {
  return createAirlocksHarnessOn(SCRATCH_REPOSITORY_GIT, tickets, limits, hasReviewPhase);
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

/** The folders of a repository and its worktrees, with no git in them: a spec's recorded answers stand for the history. */
interface HarnessPlanting {
  repository:    string;
  worktreesRoot: string;
  tipOf:         (branch: string) => string;
  branchTreeOf:  (ticketId: string) => string;
  harnessGit:    HarnessGit;
}

function plantedWithGit(git: HarnessGit, tickets: readonly HarnessTicket[]): HarnessPlanting {
  const repository = git.createRepository('airlocks');
  git.outputOf(repository, ['checkout', '-q', '-B', 'main']);
  git.commitFile(repository, 'base.ts', 'export const base = 1;\n');
  const worktreesRoot = `${repository}-worktrees`;
  for (const ticket of tickets) {
    const base = ticket.group === undefined ? 'main' : `group-${ticket.group}`;
    const worktree = join(worktreesRoot, `ticket-${ticket.id}`);
    if (ticket.group !== undefined) GroupWorktrees.prepareGroupWorktree(repository, worktreesRoot, base, 'main');
    git.outputOf(repository, ['worktree', 'add', '-q', '-b', `ticket-${ticket.id}`, worktree, base]);
    git.commitFile(worktree, ...ticket.change);
    // An integrated ticket's work already stands on the group branch, so a ticket listed after it forks off that tip.
    if (ticket.group !== undefined && ticket.status === 'reviewed') {
      git.outputOf(GroupWorktrees.groupWorktreeOf(worktreesRoot, base), ['merge', '-q', '--ff-only', `ticket-${ticket.id}`]);
    }
  }
  return {
    repository,
    worktreesRoot,
    tipOf:        (branch) => git.outputOf(repository, ['rev-parse', `refs/heads/${branch}`]),
    branchTreeOf: (ticketId) => git.outputOf(repository, ['rev-parse', `refs/heads/ticket-${ticketId}^{tree}`]),
    harnessGit:   git,
  };
}

function plantedWithNoGit(tickets: readonly HarnessTicket[]): HarnessPlanting {
  const repository = createScratchDirectory('airlocks');
  const worktreesRoot = `${repository}-worktrees`;
  for (const ticket of tickets) {
    mkdirSync(join(worktreesRoot, `ticket-${ticket.id}`), { recursive: true });
    if (ticket.group !== undefined) mkdirSync(GroupWorktrees.groupWorktreeOf(worktreesRoot, `group-${ticket.group}`), { recursive: true });
  }
  const noGit = (): never => {
    throw new Error('A harness planted with no git has no git to ask: give the case recorded answers.');
  };
  return {
    repository,
    worktreesRoot,
    tipOf:        (branch) => (branch.startsWith('group-') ? RECORDED_AIRLOCK_IDS.GROUP_TIP : branch === 'main' ? RECORDED_AIRLOCK_IDS.MAIN_TIP : RECORDED_AIRLOCK_IDS.TICKET_TIP),
    branchTreeOf: () => RECORDED_AIRLOCK_IDS.TICKET_TREE,
    harnessGit:   { createRepository: noGit, outputOf: noGit, commitFile: noGit },
  };
}

export function createAirlocksHarnessOn(
  git: HarnessGit, tickets: readonly HarnessTicket[], limits: Partial<AirlockLimits> = {}, hasReviewPhase = true
): AirlocksHarness {
  return harnessOn(plantedWithGit(git, tickets), tickets, limits, hasReviewPhase);
}

/**
 * The harness on folders with no git: every ticket's branch stands at `RECORDED_AIRLOCK_IDS.TICKET_TIP` with the tree `TICKET_TREE`, the
 * main line at `MAIN_TIP` and a group branch at `GROUP_TIP`, and the spec answers each git call the Airlocks ask from recorded answers.
 */
export function createRecordedAirlocksHarness(tickets: readonly HarnessTicket[], limits: Partial<AirlockLimits> = {}, hasReviewPhase = true): AirlocksHarness {
  return harnessOn(plantedWithNoGit(tickets), tickets, limits, hasReviewPhase);
}

function harnessOn(planting: HarnessPlanting, tickets: readonly HarnessTicket[], limits: Partial<AirlockLimits>, hasReviewPhase: boolean): AirlocksHarness {
  const {
    repository, worktreesRoot, branchTreeOf, harnessGit: git
  } = planting;
  const worktreeOf = (ticketId: string): string => join(worktreesRoot, `ticket-${ticketId}`);
  const { board } = boardFixture({
    pipeline: { prepare: [], gates: [], ...hasReviewPhase ? { review: { name: 'Review' } } : {} },
    tickets:  tickets.map((ticket) => ({
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
  const stopped: string[] = [];
  const declinedCleanups: DeclinedCleanup[] = [];
  const keptAirlockFacts = new Map<string, Readonly<Record<string, string>>>();
  const settings: AirlocksHarness['settings'] = {
    gateOutcome: 'passed', reading: { calls: 0, report: undefined }, watcherIsLive: false, refDeniesHold: true, beforeGate: () => undefined,
  };
  const mergeJob = (): Readonly<Job> | undefined => board.airlockHolderOf('main');
  const slots = createAirlocks({
    repositoryRoot:    repository,
    mainLine:          'main',
    groupTargetPrefix: 'group-',
    worktreesRoot,
    worktreeOf,
    limits:            { ...AIRLOCK_LIMITS, ...limits },
    get refDeniesHold() {
      return settings.refDeniesHold;
    },
    hold: (mutate) => {
      const result = mutate({ board, at: HARNESS_AT });
      const phase = mergeJob()?.airlock?.phase;
      if (phase !== undefined && phases.at(-1) !== phase) phases.push(phase);
      return Promise.resolve(result);
    },
    gateMergedTree: (_worktreePath, treeId) => {
      gatedTrees.push(treeId);
      settings.beforeGate();
      return Promise.resolve({ outcome: settings.gateOutcome, step: settings.gateOutcome === 'passed' ? null : 'tests', output: 'Example gate output\nexpected 2, received 3' });
    },
    mergeAgentReadingOf: () => settings.reading,
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
    keepAirlockFacts:      (mergeJob, facts) => keptAirlockFacts.set(mergeJob.id, facts),
    jobFolderOf:           (job) => join(repository, '.example-tracker', 'jobs', job.id),
    jobFolderOfId:         (jobId) => join(repository, '.example-tracker', 'jobs', jobId),
    redHandoffResumes:     2,
    dispatchIsStopped:     () => false,
    reportDeclinedCleanup: (declined) => declinedCleanups.push(declined),
  });
  return {
    git,
    repository,
    board,
    slots,
    phases,
    gatedTrees,
    stopped,
    declinedCleanups,
    keptAirlockFacts,
    settings,
    worktreeOf,
    tipOf:      planting.tipOf,
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
