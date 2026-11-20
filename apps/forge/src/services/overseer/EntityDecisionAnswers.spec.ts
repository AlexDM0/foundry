/**
 * What the Overseer does with User's answer to an entity decision, on the entity-forge fixture, before the Playbook of the same pass. What
 * matters: `work-in-other-entity` answered with a move sets the ticket's entity as User's assignment with the decision as its reason, clears
 * its row's stage and seals, and its next build is a fresh attempt of stage 1 of the new entity, never back through ticket review, whose
 * launch drops the old branch and worktree once; answered with abandoning, the ticket is abandoned (E15). `package-refused` answered with
 * dropping the change sends the ticket back to stage 1 of its home, which is told the reason and may no longer write a proposal in the
 * package; with a need, it also files the change, reason and proposal as a ticket of the package that the crossing ticket waits on, and
 * once that ticket is delivered stage 1 runs again told the settled need and to merge the main line first, which a drop tells it not; with
 * abandoning, the ticket is abandoned (E22). A crossing ticket whose package left its home's whitelist opens
 * `whitelist-removed-mid-crossing` before its next stage, once, which holds it; finishing under the old whitelist lets the stored stages
 * continue with the package kept in the ticket's crossing, and a need lifts the package's seal, sends the ticket back to stage 1 in progress
 * and files the change as a ticket of the package, whose delivery runs stage 1 again told the settled need; a row at the build of a package
 * the whitelist no longer names opens the decision too (E19). `dependent-broken` answered with a fix puts a crossing ticket in no group into the
 * group `ticket-<id>` and files a ticket of the dependent in its group that waits on it, submitted at once and in the group's release, whose
 * bundle then holds both, so the release gates the dependent with them; the ticket's next package build launches; a release ticket of the
 * group waits on the fix, a crossing ticket that released the group hands its mark to the fix, a dependent already fixed in the group gets
 * no second ticket, and abandoning abandons the ticket (E26). An answer is acted on once, one naming no option acts on nothing, and a forge
 * without entities acts on none.
 */
import { mkdirSync }  from 'node:fs';
import path, { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { type GitHookPolicy, GitProcess, type GitRun }       from '../../lib/git/GitProcess.ts';
import type { Decision, DecisionKind }                       from '../../lib/tracker-model/@types/Decision.ts';
import type { Job }                                          from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline }                                     from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording, PlaybookStep } from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { TicketStage }                                  from '../../lib/tracker-model/@types/Task.ts';
import type { Board }                                        from '../../lib/tracker-model/Board.ts';
import { ENTITY_DECISION_ANSWERS }                           from '../../lib/tracker-model/constants/EntityDecisionAnswers.ts';
import { branchNamesOf }                                     from '../../shared/BranchNames.ts';
import { LIFECYCLE_LIMITS }                                  from '../../shared/constants/LifecycleLimits.ts';
import { PRODUCT_NAMES }                                     from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                       from '../../testing/BoardFixtures.ts';
import {
  ENTITY_FORGE_ENTITIES,
  ENTITY_FORGE_MAIN_LINE,
  ENTITY_FORGE_TICKETS,
  entityForgePipelineOf,
  type EntityForgeWhitelists
} from '../../testing/EntityForgeFixture.ts';
import { NO_LISTED_TICKET_LOCATIONS, NO_UNREADABLE_RECORDS }                              from '../../testing/FixtureRecordAllocation.ts';
import { createScratchDirectory, removeScratchDirectory }                                 from '../../testing/ScratchWorkspace.ts';
import type { BoardTransaction }                                                          from '../tracker/BoardTransaction.ts';
import { createLocalRecordAllocation }                                                    from '../tracker/LocalRecordAllocation.ts';
import type { Workspace }                                                                 from '../tracker/Workspace.ts';
import { CrossingStages }                                                                 from './CrossingStages.ts';
import { EntityDecisionAnswers, type EntityDecisionAnswerContext, type PackageNeedFacts } from './EntityDecisionAnswers.ts';
import { JobLaunch, type JobLaunchContext }                                               from './JobLaunch.ts';
import { type NeedsSettledFacts, NeedTickets }                                            from './NeedTickets.ts';
import { jobFolderIn }                                                                    from './OverseerFiles.ts';

const AT = '2026-11-17T15:00:00+01:00';
const { SHOP, ADMIN, UI_KIT } = ENTITY_FORGE_ENTITIES;
const { SHOP_TICKET, NEED_TICKET } = ENTITY_FORGE_TICKETS;
const BRANCH_NAMES = branchNamesOf(null);
const SHOP_BRANCH = BRANCH_NAMES.ticketBranchOf(SHOP_TICKET.id);
const REFUSED_REASON = 'The constitution of the package forbids a second export.';
const PROPOSAL = 'diff --git a/packages/ui-kit/src/Example.ts b/packages/ui-kit/src/Example.ts\n+export const second = 2;\n';
const NEED_BODY_PREFIX = '## Acceptance\n\nA1. The package holds the proposed change.\n\n## Brief\n\n';
const OBJECT_ID = '1'.repeat(40);

/** The options a decision of the kind offers, labelled as the Overseer reads the answer back. */
function wordingOf(draft: DecisionDraft): DecisionWording {
  const answers = ENTITY_DECISION_ANSWERS;
  const optionsByKind: Partial<Record<DecisionKind, string[]>> = {
    'work-in-other-entity':           [...(draft.subject?.owningEntities ?? []).map((entityKey) => `${answers.moveToEntityPrefix}${entityKey}`), answers.abandon],
    'package-refused':                [answers.dropThePackageChange, answers.turnItIntoANeed, answers.abandon],
    'whitelist-removed-mid-crossing': [answers.finishUnderTheOldWhitelist, answers.turnThePackageChangeIntoANeed],
    'dependent-broken':               [`${answers.fileAFixTicketForPrefix}${draft.subject?.dependentEntity ?? ''}`, answers.abandon],
  };
  const options = (optionsByKind[draft.kind] ?? []).map((label) => ({ label, description: `Example ${label}`, isRecommended: false }));
  return {
    questions: [{
      question: `Example ${draft.kind} about ${draft.subject?.packageEntity ?? 'the ticket'}?`, header: draft.kind, multiSelect: false, options
    }],
    context: '',
  };
}

let gitCalls: (readonly string[])[] = [];
const folders: string[] = [];

beforeEach(() => {
  gitCalls = [];
  spyOn(GitProcess, 'run').mockImplementation((_directory: string, gitArguments: readonly string[], _hookPolicy?: GitHookPolicy): GitRun => {
    gitCalls.push(gitArguments);
    if (gitArguments[0] === 'diff') return { exitCode: 0, standardOutput: PROPOSAL, standardError: '' };
    return { exitCode: 0, standardOutput: '', standardError: '' };
  });
  spyOn(GitProcess, 'resolvedCommitOf').mockImplementation((_directory: string, revision: string): string => {
    gitCalls.push(['rev-parse', revision]);
    return OBJECT_ID;
  });
});

afterEach(() => {
  spyOn(GitProcess, 'run').mockRestore();
  spyOn(GitProcess, 'resolvedCommitOf').mockRestore();
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface Forge {
  readonly board:   Board;
  readonly change:  BoardTransaction;
  readonly context: EntityDecisionAnswerContext;
  readonly needs:   PackageNeedFacts[];
}

/** Ticket 001 of the shop in progress, in a scratch tracker, on the fixture's pipeline. */
function forgeWith(whitelists: EntityForgeWhitelists, pipelineOf: (stored: Pipeline) => Pipeline = (stored) => stored): Forge {
  const repository = createScratchDirectory('entity-decision-answers');
  folders.push(repository);
  const trackerDirectory = join(repository, PRODUCT_NAMES.DATA_FOLDER);
  mkdirSync(join(trackerDirectory, 'tickets'), { recursive: true });
  const ticket = ticketFixture({
    id: SHOP_TICKET.id, status: 'in-progress', task: 1, entity: SHOP.key
  });
  const { board } = boardFixture({ tickets: [ticket], pipeline: pipelineOf(entityForgePipelineOf(whitelists)) });
  board.setOverseerState('running', AT);
  const workspace = { rootDirectory: repository, trackerDirectory };
  const needs: PackageNeedFacts[] = [];
  const context: EntityDecisionAnswerContext = {
    decisionWordingOf:    wordingOf,
    packageNeedWordingOf: (facts) => {
      needs.push(facts);
      return { title: `Change ${facts.packageEntity} for #${facts.ticketId}`, body: `${NEED_BODY_PREFIX}${facts.refusedReason ?? ''}\n\n${facts.proposal}` };
    },
    dependentFixWordingOf: (facts) => ({ title: `Fix ${facts.dependentEntity} for #${facts.ticketId}`, body: `${NEED_BODY_PREFIX}Example fix in group ${facts.group}.` }),
    branchNames:           BRANCH_NAMES,
    mainLine:              ENTITY_FORGE_MAIN_LINE,
    repositoryRoot:        repository,
  };
  return {
    board,
    change: {
      board, at: AT, workspace, records: createLocalRecordAllocation(workspace as Workspace, board, NO_UNREADABLE_RECORDS, NO_LISTED_TICKET_LOCATIONS)
    } as unknown as BoardTransaction,
    context,
    needs
  };
}

/** A job of the shop's ticket, launched in `entity` at `stage` and ended with `outcome`. */
function endedJobOf(forge: Forge, entity: string, stage: number, outcome: 'failed' | 'refused' | 'reviewed' | 'built'): string {
  const { board } = forge;
  const { job } = board.launchJob({
    kind:        stage === TicketStagesUnderTest.packageReview ? 'review' : 'build',
    role:        stage === TicketStagesUnderTest.packageReview ? 'reviewer' : 'builder',
    ticketIds:   [SHOP_TICKET.id],
    parentJobId: null,
    attempt:     1,
    target:      ENTITY_FORGE_MAIN_LINE,
    entity,
    stage
  }, AT);
  board.endJob(job.id, outcome === 'failed' ? { outcome, cause: 'changed-only-outside-home-and-reach' } : { outcome }, AT);
  return job.id;
}

const TicketStagesUnderTest = { build: 1, packageBuild: 2, packageReview: 3 } as const;

function openDecisionOf(forge: Forge, kind: DecisionKind, subject: DecisionDraft['subject'], context: string): Readonly<Decision> {
  const draft: DecisionDraft = {
    kind, ticketIds: [SHOP_TICKET.id], jobId: null, ...(subject === undefined ? {} : { subject })
  };
  return forge.board.openDecision({
    ...draft, askedBy: 'overseer', requestId: null, questions: wordingOf(draft).questions, context
  }, AT).decision ?? fail();
}

function fail(): never {
  throw new Error('The decision did not open.');
}

function answer(forge: Forge, decision: Readonly<Decision>, label: string): void {
  forge.board.answerDecision(decision.id, [label], AT);
  EntityDecisionAnswers.actOnAnswers(forge.change, forge.context);
}

function followThePlaybook(board: Board): readonly PlaybookStep[] {
  return board.followPlaybook({ ...LIFECYCLE_LIMITS, now: AT, usageResetsAt: null }, {
    mainLine:                     ENTITY_FORGE_MAIN_LINE,
    groupTargetPrefix:            'group-',
    installVersionChanged:        false,
    ticketIdsTouchingAgentConfig: [],
    closedDeliveryTurns:          [],
    budgetSpentDeliveryTurns:     [],
    assistantHasAnswered:         false,
    assistantBootRetryDue:        false,
  }, wordingOf).steps;
}

function launchesOf(steps: readonly PlaybookStep[]): string[] {
  return steps.flatMap((step) => (step.kind === 'launch-build' || step.kind === 'launch-review'
    ? [`${step.kind} #${step.ticketId} ${step.entity ?? ''} stage ${step.stage ?? ''}${step.kind === 'launch-build' ? ` attempt ${step.attempt}` : ''}`]
    : []));
}

/** The job the Playbook launched for the shop's ticket, beside the Assistant it boots. */
function shopJobOf(board: Board): Readonly<Job> {
  return board.jobs().find((candidate) => candidate.ticketIds.includes(SHOP_TICKET.id)) ?? fail();
}

function shopTicketOf(board: Board) {
  return board.tickets().find((ticket) => ticket.frontmatter.id === SHOP_TICKET.id)?.frontmatter;
}

/** The need's ticket readied by User and delivered: the shop's next launch is its stage 1 again, and what that build is told of its needs. */
function stageOneAfterTheNeedIsDeliveredOf(forge: Forge) {
  forge.board.readyDraftTickets([NEED_TICKET.id], () => [], AT, ['ready-for-review']);
  forge.board.moveTicket(NEED_TICKET.id, 'delivered', { checksLegality: false }, AT);
  const launches = launchesOf(followThePlaybook(forge.board)).filter((launch) => launch.includes(`#${SHOP_TICKET.id} `));
  return { launches, needsSettled: NeedTickets.needsSettledOf(forge.board, shopJobOf(forge.board), { mainLine: ENTITY_FORGE_MAIN_LINE, resumesSession: false }) };
}

/** What the stage 1 build is told once the package change, filed as a need of `ui-kit`, is delivered. */
function settledPackageNeedFacts(): NeedsSettledFacts {
  return {
    needs: [{
      entity: UI_KIT.key, title: `Change ${UI_KIT.key} for #${SHOP_TICKET.id}`, ticketId: NEED_TICKET.id, status: 'delivered'
    }],
    mainLine:       ENTITY_FORGE_MAIN_LINE,
    resumesSession: false,
  };
}

function moveAlong(board: Board, stages: readonly TicketStage[]): void {
  for (const stage of stages) board.moveTicketStage(SHOP_TICKET.id, stage, AT);
}

const PACKAGE_BUILD: TicketStage = { name: 'package-build', entity: UI_KIT.key };
const PACKAGE_REVIEW: TicketStage = { name: 'package-review', entity: UI_KIT.key };
const ADAPT: TicketStage = { name: 'adapt', entity: SHOP.key };

describe('work-in-other-entity, answered', () => {
  /** Stage 1 of the shop failed on work that is all the admin app's, and the decision opened. */
  function workInTheAdminApp(): { forge: Forge; decision: Readonly<Decision> } {
    const forge = forgeWith('strict-isolation');
    endedJobOf(forge, SHOP.key, TicketStagesUnderTest.build, 'failed');
    const decision = openDecisionOf(forge, 'work-in-other-entity', { owningEntities: [ADMIN.key], paths: ['apps/admin/src/Example.ts'] }, 'apps/admin/src/Example.ts');
    return { forge, decision };
  }

  test('E15: with a move sets the entity as User\'s assignment with the decision as reason, and builds afresh at stage 1 there', () => {
    const { forge, decision } = workInTheAdminApp();
    answer(forge, decision, `${ENTITY_DECISION_ANSWERS.moveToEntityPrefix}${ADMIN.key}`);

    expect(shopTicketOf(forge.board)).toMatchObject({ entity: ADMIN.key, status: 'in-progress' });
    expect(forge.board.logRecordsSoFar().filter((record) => record.kind === 'entity-assigned').map((record) => record.kind === 'entity-assigned' && record.fields))
      .toEqual([{ entity: ADMIN.key, reason: `work-in-other-entity ${decision.id}`, by: 'user' }]);
    expect(launchesOf(followThePlaybook(forge.board))).toEqual([`launch-build #${SHOP_TICKET.id} ${ADMIN.key} stage 1 attempt 2`]);
  });

  test('E15: with a move clears a stored stage and its seals, so the new entity\'s build carries no crossing of the old', () => {
    const forge = forgeWith('shop-crosses-into-ui-kit');
    moveAlong(forge.board, [PACKAGE_BUILD, PACKAGE_REVIEW]);
    forge.board.sealTicketPackage(SHOP_TICKET.id, UI_KIT.key, 'example-seal', AT);
    moveAlong(forge.board, [ADAPT]);
    forge.board.moveTicketBackToBuild(SHOP_TICKET.id, SHOP.key, ADMIN.key, AT);
    endedJobOf(forge, SHOP.key, TicketStagesUnderTest.build, 'failed');
    const decision = openDecisionOf(forge, 'work-in-other-entity', { owningEntities: [ADMIN.key] }, 'apps/admin/src/Example.ts');
    answer(forge, decision, `${ENTITY_DECISION_ANSWERS.moveToEntityPrefix}${ADMIN.key}`);

    expect(forge.board.ticketStageOf(SHOP_TICKET.id)).toBeNull();
    expect(forge.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({});
  });

  test('E15: the new entity\'s build drops the old branch and worktree before its worktree is made, once', () => {
    const { forge, decision } = workInTheAdminApp();
    answer(forge, decision, `${ENTITY_DECISION_ANSWERS.moveToEntityPrefix}${ADMIN.key}`);
    followThePlaybook(forge.board);
    const job = shopJobOf(forge.board);
    const { workspace } = forge.change;
    const context = {
      workspace, branchNames: BRANCH_NAMES, mainLine: ENTITY_FORGE_MAIN_LINE, log: () => undefined, platformPorts: { dataFolders: { pathModule: path, foldsCase: false } },
    } as unknown as JobLaunchContext;
    const worktree = JobLaunch.worktreeOf(workspace, job);
    mkdirSync(worktree, { recursive: true });
    const jobFolder = jobFolderIn(workspace.trackerDirectory, job.id);

    JobLaunch.startAfreshInTheNewEntity(context, forge.board, job, jobFolder);
    JobLaunch.startAfreshInTheNewEntity(context, forge.board, job, jobFolder);

    expect(gitCalls).toEqual([['worktree', 'remove', '--force', worktree], ['rev-parse', `refs/heads/${SHOP_BRANCH}`], ['branch', '-D', SHOP_BRANCH]]);
  });

  test('E15: a build of a ticket whose entity did not change keeps its branch', () => {
    const forge = forgeWith('strict-isolation');
    endedJobOf(forge, SHOP.key, TicketStagesUnderTest.build, 'failed');
    followThePlaybook(forge.board);
    const job = shopJobOf(forge.board);
    const context = { workspace: forge.change.workspace, branchNames: BRANCH_NAMES } as unknown as JobLaunchContext;

    JobLaunch.startAfreshInTheNewEntity(context, forge.board, job, jobFolderIn(forge.change.workspace.trackerDirectory, job.id));

    expect(gitCalls).toEqual([]);
  });

  test('E15: with abandoning abandons the ticket', () => {
    const { forge, decision } = workInTheAdminApp();
    answer(forge, decision, ENTITY_DECISION_ANSWERS.abandon);

    expect(shopTicketOf(forge.board)).toMatchObject({ entity: SHOP.key, status: 'abandoned' });
  });

  test('an answer is acted on once, and one that names no option acts on nothing, so the ticket runs again as it stood', () => {
    const moved = workInTheAdminApp();
    answer(moved.forge, moved.decision, `${ENTITY_DECISION_ANSWERS.moveToEntityPrefix}${ADMIN.key}`);
    EntityDecisionAnswers.actOnAnswers(moved.forge.change, moved.forge.context);
    expect(EntityDecisionAnswers.answersToActOnOf(moved.forge.board)).toEqual([]);
    expect(moved.forge.board.logRecordsSoFar().filter((record) => record.kind === 'entity-assigned')).toHaveLength(1);

    const freeText = workInTheAdminApp();
    answer(freeText.forge, freeText.decision, 'Example answer of my own');
    expect(shopTicketOf(freeText.forge.board)).toMatchObject({ entity: SHOP.key, status: 'in-progress' });
    expect(launchesOf(followThePlaybook(freeText.forge.board))).toEqual([`launch-build #${SHOP_TICKET.id} ${SHOP.key} stage 1 attempt 2`]);
    expect(EntityDecisionAnswers.answersToActOnOf(freeText.forge.board)).toEqual([]);
  });

  test('a forge without entities acts on no answer', () => {
    const { forge, decision } = workInTheAdminApp();
    const withoutEntities = forgeWith('strict-isolation', (stored) => {
      const pipeline = { ...stored };
      delete pipeline.entities;
      return pipeline;
    });
    forge.board.answerDecision(decision.id, [`${ENTITY_DECISION_ANSWERS.moveToEntityPrefix}${ADMIN.key}`], AT);
    EntityDecisionAnswers.actOnAnswers({ ...forge.change, board: withoutEntities.board } as BoardTransaction, forge.context);

    expect(shopTicketOf(withoutEntities.board)?.entity).toBe(SHOP.key);
    expect(withoutEntities.board.logRecordsSoFar().some((record) => record.kind === 'entity-assigned')).toBe(false);
  });
});

describe('package-refused, answered', () => {
  /** The package build of the shop's crossing refused the change, its reason kept in its job folder, and the decision opened. */
  function refusedPackageChange(): { forge: Forge; decision: Readonly<Decision>; refusedJobId: string } {
    const forge = forgeWith('shop-crosses-into-ui-kit');
    endedJobOf(forge, SHOP.key, TicketStagesUnderTest.build, 'built');
    moveAlong(forge.board, [PACKAGE_BUILD]);
    const refusedJobId = endedJobOf(forge, UI_KIT.key, TicketStagesUnderTest.packageBuild, 'refused');
    CrossingStages.writeStageStatement(forge.change.workspace.trackerDirectory, refusedJobId, { stage: 'package-refused', refusedReason: REFUSED_REASON });
    const decision = openDecisionOf(forge, 'package-refused', { packageEntity: UI_KIT.key }, REFUSED_REASON);
    return { forge, decision, refusedJobId };
  }

  /** What stage 1 of the shop is told and may write, as a fresh stage 1 job reads it. */
  function stageOneOf(forge: Forge) {
    const job = { ...shopJobOf(forge.board) };
    return {
      proposalHomes: CrossingStages.proposalHomesOf(forge.board.pipeline(), job, CrossingStages.refusedPackagesOf(forge.board.logRecordsSoFar(), SHOP_TICKET.id)),
      facts:         CrossingStages.crossingStageFactsOf(forge.board, forge.change.workspace.trackerDirectory, job, false),
    };
  }

  test('E22: holds the ticket at its package build until answered', () => {
    const { forge } = refusedPackageChange();
    expect(launchesOf(followThePlaybook(forge.board))).toEqual([]);
  });

  test('E22: dropping the change sends the ticket to stage 1, told the reason, with no proposal home in the package', () => {
    const { forge, decision } = refusedPackageChange();
    answer(forge, decision, ENTITY_DECISION_ANSWERS.dropThePackageChange);

    expect(forge.board.ticketStageOf(SHOP_TICKET.id)).toEqual({ name: 'build', entity: SHOP.key });
    expect(launchesOf(followThePlaybook(forge.board))).toEqual([`launch-build #${SHOP_TICKET.id} ${SHOP.key} stage 1 attempt 2`]);
    expect(stageOneOf(forge)).toEqual({
      proposalHomes: [],
      facts:         { stage: 'build', whitelistedPackages: [], refusedPackageChanges: [{ entity: UI_KIT.key, refusedReason: REFUSED_REASON }] },
    });
    expect(forge.board.tickets()).toHaveLength(1);
  });

  test('E22: a need also files the change, its reason and the proposal, as a ticket of the package the crossing ticket waits on', () => {
    const { forge, decision, refusedJobId } = refusedPackageChange();
    answer(forge, decision, ENTITY_DECISION_ANSWERS.turnItIntoANeed);

    expect(forge.board.ticketStageOf(SHOP_TICKET.id)).toEqual({ name: 'build', entity: SHOP.key });
    expect(forge.needs).toEqual([{
      cause:         'package-refused',
      ticketId:      SHOP_TICKET.id,
      ticketBranch:  SHOP_BRANCH,
      homeEntity:    SHOP.key,
      packageEntity: UI_KIT.key,
      refusedReason: REFUSED_REASON,
      proposal:      PROPOSAL,
    }]);
    const need = forge.board.tickets().find((ticket) => ticket.frontmatter.id === NEED_TICKET.id);
    expect(need?.frontmatter).toMatchObject({ entity: UI_KIT.key, filedByJob: refusedJobId });
    expect(need?.body).toContain(REFUSED_REASON);
    expect(need?.body).toContain(PROPOSAL.trim());
    expect(shopTicketOf(forge.board)?.dependsOn).toEqual([NEED_TICKET.id]);
    expect(gitCalls).toContainEqual(['diff', '--no-ext-diff', `${ENTITY_FORGE_MAIN_LINE}...${SHOP_BRANCH}`, '--', UI_KIT.homeFolder]);
    expect(launchesOf(followThePlaybook(forge.board)).filter((launch) => launch.includes(`#${SHOP_TICKET.id} `))).toEqual([]);
  });

  test('E22: once the need is delivered, stage 1 runs again told the settled need and to merge the main line first', () => {
    const { forge, decision, refusedJobId } = refusedPackageChange();
    answer(forge, decision, ENTITY_DECISION_ANSWERS.turnItIntoANeed);
    const rerun = stageOneAfterTheNeedIsDeliveredOf(forge);

    expect(rerun.launches.map((launch) => launch.replace(/ attempt \d+$/u, ''))).toEqual([`launch-build #${SHOP_TICKET.id} ${SHOP.key} stage 1`]);
    expect(rerun.needsSettled).toEqual(settledPackageNeedFacts());
    expect(forge.board.tickets().find((ticket) => ticket.frontmatter.id === NEED_TICKET.id)?.frontmatter.filedByJob).toBe(refusedJobId);
  });

  test('E22: dropping the change tells the stage 1 build of no settled need', () => {
    const { forge, decision } = refusedPackageChange();
    answer(forge, decision, ENTITY_DECISION_ANSWERS.dropThePackageChange);
    followThePlaybook(forge.board);

    expect(NeedTickets.needsSettledOf(forge.board, shopJobOf(forge.board), { mainLine: ENTITY_FORGE_MAIN_LINE, resumesSession: false })).toBeNull();
  });

  test('E22: abandoning abandons the ticket', () => {
    const { forge, decision } = refusedPackageChange();
    answer(forge, decision, ENTITY_DECISION_ANSWERS.abandon);

    expect(shopTicketOf(forge.board)?.status).toBe('abandoned');
    expect(forge.board.ticketStageOf(SHOP_TICKET.id)).toEqual(PACKAGE_BUILD);
  });
});

describe('a package that left the whitelist mid-crossing', () => {
  /** The shop's ticket at adapt with the package sealed, on a pipeline whose shop no longer whitelists the package. */
  function crossingAfterTheWhitelistChanged(whitelists: EntityForgeWhitelists = 'strict-isolation'): Forge {
    const forge = forgeWith(whitelists);
    endedJobOf(forge, SHOP.key, TicketStagesUnderTest.build, 'built');
    moveAlong(forge.board, [PACKAGE_BUILD, PACKAGE_REVIEW]);
    endedJobOf(forge, UI_KIT.key, TicketStagesUnderTest.packageReview, 'reviewed');
    forge.board.sealTicketPackage(SHOP_TICKET.id, UI_KIT.key, 'example-seal', AT);
    moveAlong(forge.board, [ADAPT]);
    return forge;
  }

  function openedDecisionOf(forge: Forge): Readonly<Decision> {
    EntityDecisionAnswers.openWhitelistRemovedDecisions(forge.board, wordingOf, AT);
    return forge.board.decisions().find((decision) => decision.kind === 'whitelist-removed-mid-crossing') ?? fail();
  }

  test('E19: opens whitelist-removed-mid-crossing naming the ticket and the package before its next stage, once, which holds it', () => {
    const forge = crossingAfterTheWhitelistChanged();
    const decision = openedDecisionOf(forge);
    EntityDecisionAnswers.openWhitelistRemovedDecisions(forge.board, wordingOf, AT);

    expect(forge.board.decisions().map(({ kind, ticketIds, context }) => ({ kind, ticketIds, context })))
      .toEqual([{ kind: 'whitelist-removed-mid-crossing', ticketIds: [SHOP_TICKET.id], context: UI_KIT.key }]);
    expect(decision.questions[0]?.question).toContain(UI_KIT.key);
    expect(launchesOf(followThePlaybook(forge.board))).toEqual([]);
  });

  test('E19: a crossing whose package the whitelist still names opens nothing', () => {
    const forge = crossingAfterTheWhitelistChanged('shop-crosses-into-ui-kit');
    EntityDecisionAnswers.openWhitelistRemovedDecisions(forge.board, wordingOf, AT);

    expect(forge.board.decisions()).toEqual([]);
  });

  test('E19: finishing under the old whitelist continues the stored stages and keeps the package in the ticket\'s crossing', () => {
    const forge = crossingAfterTheWhitelistChanged();
    answer(forge, openedDecisionOf(forge), ENTITY_DECISION_ANSWERS.finishUnderTheOldWhitelist);
    EntityDecisionAnswers.openWhitelistRemovedDecisions(forge.board, wordingOf, AT);

    expect(forge.board.decisions()).toEqual([]);
    expect(forge.board.ticketStageOf(SHOP_TICKET.id)).toEqual(ADAPT);
    expect(CrossingStages.ticketWhitelistOf(forge.board, SHOP_TICKET.id, SHOP.key)).toEqual([UI_KIT.key]);
    expect(launchesOf(followThePlaybook(forge.board))).toEqual([`launch-build #${SHOP_TICKET.id} ${SHOP.key} stage 4 attempt 1`]);
  });

  test('E19: turning the package change into a need lifts its seal, sends the ticket to stage 1 in progress and files the need', () => {
    const forge = crossingAfterTheWhitelistChanged();
    forge.board.moveTicket(SHOP_TICKET.id, 'in-review', { checksLegality: true }, AT);
    answer(forge, openedDecisionOf(forge), ENTITY_DECISION_ANSWERS.turnThePackageChangeIntoANeed);

    expect(forge.board.ticketSealsOf(SHOP_TICKET.id)).toEqual({});
    expect(forge.board.ticketStageOf(SHOP_TICKET.id)).toEqual({ name: 'build', entity: SHOP.key });
    expect(shopTicketOf(forge.board)).toMatchObject({ status: 'in-progress', dependsOn: [NEED_TICKET.id] });
    expect(forge.needs.map(({ cause, packageEntity, refusedReason }) => ({ cause, packageEntity, refusedReason })))
      .toEqual([{ cause: 'whitelist-removed', packageEntity: UI_KIT.key, refusedReason: null }]);
    expect(forge.board.tickets().find((ticket) => ticket.frontmatter.id === NEED_TICKET.id)?.frontmatter.entity).toBe(UI_KIT.key);
  });

  test('E19: once the need is delivered, stage 1 runs again told the settled need and to merge the main line first', () => {
    const forge = crossingAfterTheWhitelistChanged();
    const packageReviewJobId = forge.board.logRecordsSoFar().findLast((record) => record.kind === 'job-launched')?.jobId ?? '';
    answer(forge, openedDecisionOf(forge), ENTITY_DECISION_ANSWERS.turnThePackageChangeIntoANeed);
    const rerun = stageOneAfterTheNeedIsDeliveredOf(forge);

    expect(rerun.launches.map((launch) => launch.replace(/ attempt \d+$/u, ''))).toEqual([`launch-build #${SHOP_TICKET.id} ${SHOP.key} stage 1`]);
    expect(rerun.needsSettled).toEqual(settledPackageNeedFacts());
    expect(forge.board.tickets().find((ticket) => ticket.frontmatter.id === NEED_TICKET.id)?.frontmatter.filedByJob).toBe(packageReviewJobId);
  });

  test('E19: a row at the build of a package the whitelist no longer names opens the decision, and a need sends stage 1 back', () => {
    const forge = forgeWith('strict-isolation');
    endedJobOf(forge, SHOP.key, TicketStagesUnderTest.build, 'built');
    moveAlong(forge.board, [PACKAGE_BUILD]);
    const decision = openedDecisionOf(forge);

    expect(decision.context).toBe(UI_KIT.key);
    expect(launchesOf(followThePlaybook(forge.board))).toEqual([]);

    answer(forge, decision, ENTITY_DECISION_ANSWERS.turnThePackageChangeIntoANeed);
    expect(forge.board.ticketStageOf(SHOP_TICKET.id)).toEqual({ name: 'build', entity: SHOP.key });
    expect(shopTicketOf(forge.board)?.dependsOn).toEqual([NEED_TICKET.id]);
  });
});

describe('dependent-broken, answered', () => {
  const FIX_TICKET_ID = '002';
  const FIX_ANSWER = `${ENTITY_DECISION_ANSWERS.fileAFixTicketForPrefix}${ADMIN.key}`;

  /** The shop's ticket in its package build, whose gate of the admin app stayed red, and the decision that opened. */
  function brokenAdminApp(prepare: (forge: Forge) => void = () => undefined): { forge: Forge; decision: Readonly<Decision> } {
    const forge = forgeWith('shop-crosses-into-ui-kit');
    moveAlong(forge.board, [PACKAGE_BUILD]);
    prepare(forge);
    endedJobOf(forge, UI_KIT.key, TicketStagesUnderTest.packageBuild, 'failed');
    const decision = openDecisionOf(forge, 'dependent-broken', { packageEntity: UI_KIT.key, dependentEntity: ADMIN.key }, `${ADMIN.key}: verify`);
    return { forge, decision };
  }

  function ticketOf(board: Board, ticketId: string) {
    return board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter;
  }

  test('E26: a fix puts the ticket in no group into its own group and files the admin app\'s ticket there, waiting on it', () => {
    const { forge, decision } = brokenAdminApp();
    answer(forge, decision, FIX_ANSWER);
    const group = `ticket-${SHOP_TICKET.id}`;

    expect(shopTicketOf(forge.board)).toMatchObject({ group, status: 'in-progress' });
    expect(ticketOf(forge.board, FIX_TICKET_ID)).toMatchObject({
      entity: ADMIN.key, group, dependsOn: [SHOP_TICKET.id], status: 'ready-for-review', title: `Fix ${ADMIN.key} for #${SHOP_TICKET.id}`
    });
    expect(forge.board.logRecordsSoFar().filter((record) => record.kind === 'ticket-grouped' || record.kind === 'dependent-fix-filed'))
      .toMatchObject([
        { kind: 'ticket-grouped', ticketId: SHOP_TICKET.id, fields: { group } },
        { kind: 'dependent-fix-filed', ticketId: SHOP_TICKET.id, fields: { entity: ADMIN.key, fixTicketIds: [FIX_TICKET_ID] } },
      ]);
  });

  test('E26: the fix ticket becomes the group\'s release ticket, so the release lands both and gates the admin app with them (E68)', () => {
    const { forge, decision } = brokenAdminApp();
    answer(forge, decision, FIX_ANSWER);

    expect(ticketOf(forge.board, FIX_TICKET_ID)?.releasesGroup).toBe(true);
    expect(forge.board.releaseBundleOf(`ticket-${SHOP_TICKET.id}`)).toEqual([SHOP_TICKET.id, FIX_TICKET_ID]);
  });

  test('E26: the ticket\'s package build runs again, and the answer is acted on once', () => {
    const { forge, decision } = brokenAdminApp();
    answer(forge, decision, FIX_ANSWER);
    EntityDecisionAnswers.actOnAnswers(forge.change, forge.context);

    expect(EntityDecisionAnswers.answersToActOnOf(forge.board)).toEqual([]);
    expect(forge.board.tickets()).toHaveLength(2);
    expect(launchesOf(followThePlaybook(forge.board))).toEqual([`launch-build #${SHOP_TICKET.id} ${UI_KIT.key} stage 2 attempt 2`]);
  });

  test('E26: in a group with a release ticket the release ticket waits on the fix; a crossing ticket that released the group hands it over', () => {
    const released = brokenAdminApp((forge) => {
      forge.board.setTicketGroup(SHOP_TICKET.id, 'example-release', AT);
      forge.board.fileTicket(ticketFixture({
        id: '002', status: 'pending', entity: SHOP.key, group: 'example-release'
      }), AT);
      forge.board.markReleaseTicket('002', AT);
    });
    answer(released.forge, released.decision, FIX_ANSWER);
    expect(ticketOf(released.forge.board, '003')).toMatchObject({ entity: ADMIN.key, group: 'example-release', dependsOn: [SHOP_TICKET.id] });
    expect(ticketOf(released.forge.board, '002')).toMatchObject({ releasesGroup: true, dependsOn: ['003'] });

    const releasing = brokenAdminApp((forge) => {
      forge.board.setTicketGroup(SHOP_TICKET.id, 'example-release', AT);
      forge.board.markReleaseTicket(SHOP_TICKET.id, AT);
    });
    answer(releasing.forge, releasing.decision, FIX_ANSWER);
    expect(shopTicketOf(releasing.forge.board)?.releasesGroup).toBeUndefined();
    expect(ticketOf(releasing.forge.board, FIX_TICKET_ID)?.releasesGroup).toBe(true);
  });

  test('E26: an answer User follows with ticket group before the next pass is still acted on, filing the fix in the group User named', () => {
    const { forge, decision } = brokenAdminApp();
    forge.board.answerDecision(decision.id, [FIX_ANSWER], AT);
    forge.board.setTicketGroup(SHOP_TICKET.id, 'example-release', AT);
    EntityDecisionAnswers.actOnAnswers(forge.change, forge.context);

    expect(ticketOf(forge.board, FIX_TICKET_ID)).toMatchObject({ entity: ADMIN.key, group: 'example-release', dependsOn: [SHOP_TICKET.id] });
    expect(EntityDecisionAnswers.answersToActOnOf(forge.board)).toEqual([]);
  });

  test('E26: a dependent that already has a ticket in the group gets no second one', () => {
    const { forge, decision } = brokenAdminApp((prepared) => {
      prepared.board.setTicketGroup(SHOP_TICKET.id, 'example-release', AT);
      prepared.board.fileTicket(ticketFixture({
        id: '002', status: 'pending', entity: ADMIN.key, group: 'example-release'
      }), AT);
    });
    answer(forge, decision, FIX_ANSWER);

    expect(forge.board.tickets()).toHaveLength(2);
    expect(forge.board.logRecordsSoFar().some((record) => record.kind === 'dependent-fix-filed')).toBe(false);
  });

  test('E26: abandoning abandons the ticket and files no fix', () => {
    const { forge, decision } = brokenAdminApp();
    answer(forge, decision, ENTITY_DECISION_ANSWERS.abandon);

    expect(shopTicketOf(forge.board)).toMatchObject({ status: 'abandoned' });
    expect(shopTicketOf(forge.board)?.group).toBeUndefined();
    expect(forge.board.tickets()).toHaveLength(1);
  });
});
