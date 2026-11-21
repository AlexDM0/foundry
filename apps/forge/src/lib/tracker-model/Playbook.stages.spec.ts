/**
 * The Playbook's launches for a crossing ticket's stages (strategy 4.2 and 5.8) on the entity-forge fixture's entities, each rule claim
 * watched failing under the mutant of its line. What matters: a ticket whose row stores a stage launches that stage's job in the stage's
 * entity and number whatever its status, a reviewer only for an entity with a review phase; review rounds count within their stage and are
 * kept on a return to it, so the home review's round 1 is its first; a package review never counts against the home builder's resumes,
 * while it counts against the package builder's, so a package build and package review loop parks once they are spent (E34); a ticket that
 * crosses into no package launches as today, as stage 1 or stage 5 of its own entity, and still parks after today's failed passes when
 * review rounds come between its failed builds; a forge without entities launches exactly as today, a stored stage ignored. The scheduling
 * cases: a stage's job holds one slot and a ticket between stages none (E70); a ticket between stages goes before a ready ticket of its
 * priority (E71); a stage's job names its entity, which an entity's cap counts (E72); two tickets cross into one package at once (E73); a
 * restart mid-stage resumes the stage's job once User resumes it and launches no second one (E74); a hold between stages holds and the
 * successor of a stage job that was stopped or replaced by a fresh job stays in its stage (E75), as does that of a package build or adapt
 * that wound down (E17); a usage limit holds a ticket between stages (E76); and an open decision of the package stages (`package-refused`,
 * `second-return`, `dependent-broken`, `whitelist-removed-mid-crossing`) holds the ticket it names until User answers (E22, E45, E26, E19).
 * A committed ticket without an entity launches nothing on a pipeline with entities until it has one, since its build would read the
 * forge-level pipeline, while a forge without entities launches it as today (E94).
 */
import { describe, expect, test } from 'bun:test';

import { ENTITY_FORGE_ENTITIES }              from '../../testing/EntityForgeFixture.ts';
import { mutatedModuleOf, type SourceMutant } from '../../testing/SourceMutant.ts';
import type { Decision }                      from './@types/Decision.ts';
import type { LogRecord }                     from './@types/LogRecord.ts';
import type { PlaybookStep }                  from './@types/PlaybookStep.ts';
import type { TicketStage }                   from './@types/Task.ts';
import type { PlaybookFacts }                 from './Playbook.ts';
import { Playbook }                           from './Playbook.ts';
import {
  FIXTURE_LIMITS,
  LIVE_ASSISTANT,
  endedRecord,
  factsWith,
  interruptedRecord,
  jobFixture,
  launchedTicketIdsOf,
  resumeInstructedRecord,
  stagedLaunchedRecord,
  ticketOf,
  ticketRecord
}                                             from './testing/LifecycleFixtures.ts';

const POLICY_MODULE = 'src/lib/tracker-model/Playbook.ts';

const FAILED_PASS_MODULE = 'src/lib/tracker-model/utils/FailedPassUtil.ts';

const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;

interface StageClaim {
  name:    string;
  holds:   (policy: typeof Playbook) => boolean;
  /** Absent where the claim follows from a rule older than stages, which its own spec already watches failing. */
  mutant?: SourceMutant;
}

function policyLine(find: string, replace: string): SourceMutant {
  return { modulePath: POLICY_MODULE, find, replace };
}

/** A rewrite of the failed-pass reading, which the Playbook's bundle loads, so a claim on the Playbook can be watched failing without it. */
function failedPassLine(find: string, replace: string): SourceMutant {
  return { modulePath: FAILED_PASS_MODULE, find, replace };
}

function stageOf(name: TicketStage['name'], entity: string): TicketStage {
  return { name, entity };
}

const PACKAGE_BUILD  = stageOf('package-build', UI_KIT.key);
const PACKAGE_REVIEW = stageOf('package-review', UI_KIT.key);
const HOME_REVIEW    = stageOf('review', SHOP.key);

/** Ticket 001 of the shop, which crosses into the package. */
function crossingTicket(stage: TicketStage, status: 'in-progress' | 'in-review' = 'in-progress', overrides: Parameters<typeof ticketOf>[2] = {}) {
  return ticketOf('001', status, { entity: SHOP.key, stage, ...overrides });
}

/** Stage 1 of ticket 001 built in the shop, which the crossing follows. */
const HOME_BUILT: LogRecord[] = [stagedLaunchedRecord('J1', 'build', '001', SHOP.key, 1), endedRecord('J1', 'built')];

const SHOP_TICKET = { entity: SHOP.key };

const BOTH_REVIEWED = [SHOP.key, UI_KIT.key];

function launchesOf(steps: readonly PlaybookStep[]): PlaybookStep[] {
  return steps.filter((step) => step.kind === 'launch-build' || step.kind === 'launch-review');
}

function launchesExactly(policy: typeof Playbook, facts: Parameters<typeof Playbook.nextStepsOf>[0], expected: readonly PlaybookStep[]): boolean {
  return Bun.deepEquals(launchesOf(policy.nextStepsOf(facts, FIXTURE_LIMITS)), expected, true);
}

/** A forge with entities whose ticket 001 built its stage 1 in the shop, which has a review. */
function entityFacts(overrides: Parameters<typeof factsWith>[0] = {}): ReturnType<typeof factsWith> {
  return factsWith({
    pipelineHasEntities: true, entitiesWithReview: [SHOP.key], logRecords: HOME_BUILT, ...overrides
  });
}

function packageBuildOf(ticketId: string, attempt: number = 1): PlaybookStep {
  return {
    kind: 'launch-build', ticketId, attempt, base: 'main', entity: UI_KIT.key, stage: 2
  };
}

function openDecisionOf(kind: Decision['kind']): Decision {
  return {
    id: 'E1', kind, ticketIds: ['001'], jobId: null, askedBy: 'hephaestus', requestId: null, questions: [], context: '', openedAt: '2026-11-17T12:00:00+01:00',
  };
}

const CLAIMS: StageClaim[] = [
  {
    name:   'a ticket in a build stage launches the stage\'s builder in the stage\'s entity and number',
    holds:  (policy) => launchesExactly(policy, entityFacts({ tickets: [crossingTicket(PACKAGE_BUILD)] }), [packageBuildOf('001')]),
    mutant: policyLine('ticket.stage !== undefined && ticket.status !== \'committed\') return', 'false) return'),
  },
  {
    name:  'a ticket in a review stage launches the reviewer of the stage\'s entity, whatever its status',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true, entitiesWithReview: BOTH_REVIEWED, tickets: [crossingTicket(PACKAGE_REVIEW)], logRecords: HOME_BUILT,
    }), [{
      kind: 'launch-review', ticketId: '001', round: 1, target: 'main', entity: UI_KIT.key, stage: 3
    }]),
    mutant: policyLine('  if (REVIEW_STAGE_NAMES.includes(stage.name)) {\n', '  if (false) {\n'),
  },
  {
    name:  'a review stage of an entity without a review phase launches no reviewer',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true, entitiesWithReview: [SHOP.key], tickets: [crossingTicket(PACKAGE_REVIEW)], logRecords: HOME_BUILT,
    }), []),
    mutant: policyLine('    if (!facts.entitiesWithReview.includes(stage.entity)) return null;\n', ''),
  },
  {
    name:  'review rounds count per stage: the home review\'s first round is 1 whatever the package review was granted',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      entitiesWithReview:  BOTH_REVIEWED,
      tickets:             [crossingTicket(HOME_REVIEW, 'in-review')],
      logRecords:          [
        ...HOME_BUILT,
        stagedLaunchedRecord('R1', 'review', '001', UI_KIT.key, 3),
        endedRecord('R1', 'round-granted'),
        stagedLaunchedRecord('R2', 'review', '001', UI_KIT.key, 3),
        endedRecord('R2', 'reviewed'),
      ],
    }), [{
      kind: 'launch-review', ticketId: '001', round: 1, target: 'main', entity: SHOP.key, stage: 5
    }]),
    mutant: policyLine('=== stageKey) stageRoundsGranted += 1', ') stageRoundsGranted += 1'),
  },
  {
    name:  'a review stage granted a round runs its next round',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      entitiesWithReview:  BOTH_REVIEWED,
      tickets:             [crossingTicket(PACKAGE_REVIEW)],
      logRecords:          [...HOME_BUILT, stagedLaunchedRecord('R1', 'review', '001', UI_KIT.key, 3), endedRecord('R1', 'round-granted')],
    }), [{
      kind: 'launch-review', ticketId: '001', round: 2, target: 'main', entity: UI_KIT.key, stage: 3
    }]),
    mutant: policyLine('stageRoundsGranted += 1', 'stageRoundsGranted += 0'),
  },
  {
    name:  'a review stage keeps its rounds when the ticket returns to it',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      entitiesWithReview:  BOTH_REVIEWED,
      tickets:             [crossingTicket(PACKAGE_REVIEW)],
      logRecords:          [
        ...HOME_BUILT,
        stagedLaunchedRecord('R1', 'review', '001', UI_KIT.key, 3),
        endedRecord('R1', 'round-granted'),
        stagedLaunchedRecord('B1', 'build', '001', UI_KIT.key, 2),
        endedRecord('B1', 'built'),
      ],
    }), [{
      kind: 'launch-review', ticketId: '001', round: 2, target: 'main', entity: UI_KIT.key, stage: 3
    }]),
    mutant: policyLine('if (record.kind === \'tracker-cleared\') stageRoundsGranted = 0;', 'if (record.kind === \'job-launched\') stageRoundsGranted = 0;'),
  },
  {
    name:  'a package review that did not hold never counts against the home builder\'s resumes',
    holds: (policy) => policy.handoffCycleResumesOf({
      kind: 'build', ticketIds: ['001'], attempt: 1, entity: SHOP.key, stage: 1
    }, [
      ...HOME_BUILT,
      ...[1, 2, 3].flatMap((review) => [stagedLaunchedRecord(`R${review}`, 'review', '001', UI_KIT.key, 3), endedRecord(`R${review}`, 'does-not-hold')]),
    ]) === 0,
    mutant: policyLine('|| endedReview.entity === undefined || endedReview.entity === cycle.entity)', '|| true)'),
  },
  {
    name:  'E34: a package build sent back by its package reviews past the package builder\'s resumes parks red-resumes-spent',
    holds: (policy) => Bun.deepEquals(policy.nextStepsOf(entityFacts({
      entitiesWithReview: BOTH_REVIEWED,
      tickets:            [crossingTicket(PACKAGE_BUILD)],
      logRecords:         [
        ...HOME_BUILT,
        stagedLaunchedRecord('P1', 'build', '001', UI_KIT.key, 2),
        endedRecord('P1', 'built'),
        ...[1, 2, 3].flatMap((review): LogRecord[] => [
          stagedLaunchedRecord(`R${review}`, 'review', '001', UI_KIT.key, 3),
          endedRecord(`R${review}`, 'does-not-hold'),
          ...(review < 3 ? [stagedLaunchedRecord(`P${review + 1}`, 'build', '001', UI_KIT.key, 2), endedRecord(`P${review + 1}`, 'built')] : []),
        ]),
      ],
    }), FIXTURE_LIMITS), [{ kind: 'park', ticketId: '001', cause: 'red-resumes-spent' }], true),
    mutant: policyLine('    ...(newestBuild?.stage === undefined ? {} : { stage: newestBuild.stage }),\n', ''),
  },
  {
    name:  'E34: a package build sent back by its package review within the package builder\'s resumes runs again in the same attempt',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      entitiesWithReview:  BOTH_REVIEWED,
      tickets:             [crossingTicket(PACKAGE_BUILD)],
      logRecords:          [
        ...HOME_BUILT,
        stagedLaunchedRecord('P1', 'build', '001', UI_KIT.key, 2),
        endedRecord('P1', 'built'),
        stagedLaunchedRecord('R1', 'review', '001', UI_KIT.key, 3),
        endedRecord('R1', 'does-not-hold'),
      ],
    }), [packageBuildOf('001')]),
  },
  {
    name:  'a ticket that crosses into no package builds as stage 1 of its entity and is reviewed as stage 5, its attempt and round as today',
    holds: (policy) => launchesExactly(policy, entityFacts({ logRecords: [], tickets: [ticketOf('001', 'in-review', SHOP_TICKET), ticketOf('002', 'committed', SHOP_TICKET)] }), [
      {
        kind: 'launch-review', ticketId: '001', round: 1, target: 'main', entity: SHOP.key, stage: 5
      },
      {
        kind: 'launch-build', ticketId: '002', attempt: 1, base: 'main', entity: SHOP.key, stage: 1
      },
    ]),
    mutant: policyLine('ownEntityLaunchStageOf(ticket, facts, \'review\')', 'ownEntityLaunchStageOf(ticket, facts, \'build\')'),
  },
  {
    name:  'a ticket that crosses into no package parks after today\'s failed passes, a review round between its failed builds',
    holds: (policy) => Bun.deepEquals(policy.nextStepsOf(entityFacts({
      tickets:    [ticketOf('001', 'in-progress', SHOP_TICKET)],
      logRecords: [
        ticketRecord('ticket-started', '001'),
        stagedLaunchedRecord('B1', 'build', '001', SHOP.key, 1),
        endedRecord('B1', 'failed'),
        stagedLaunchedRecord('B2', 'build', '001', SHOP.key, 1, 2),
        endedRecord('B2', 'built'),
        ticketRecord('ticket-finished', '001'),
        stagedLaunchedRecord('R1', 'review', '001', SHOP.key, 5),
        endedRecord('R1', 'does-not-hold'),
        ticketRecord('ticket-started', '001'),
        stagedLaunchedRecord('B3', 'build', '001', SHOP.key, 1, 2),
        endedRecord('B3', 'failed'),
      ],
    }), FIXTURE_LIMITS), [{ kind: 'park', ticketId: '001', cause: 'failed-passes' }], true),
    mutant: failedPassLine('if (ticketHasCrossed && launchStage !== undefined', 'if (launchStage !== undefined'),
  },
  {
    name:  'a forge without entities launches exactly as today, naming no entity or stage',
    holds: (policy) => launchesExactly(policy, factsWith({ tickets: [ticketOf('001', 'committed', { entity: SHOP.key })] }), [{
      kind: 'launch-build', ticketId: '001', attempt: 1, base: 'main'
    }]),
    mutant: policyLine('  if (!facts.pipelineHasEntities || ticket.entity === undefined) return {};\n', '  if (ticket.entity === undefined) return {};\n'),
  },
  {
    name:  'a forge without entities ignores a stored stage and rebuilds by the status, as today',
    holds: (policy) => launchesExactly(policy, factsWith({ tickets: [ticketOf('001', 'in-progress', { stage: PACKAGE_BUILD })], logRecords: HOME_BUILT }), [{
      kind: 'launch-build', ticketId: '001', attempt: 1, base: 'main'
    }]),
    mutant: policyLine('  if (facts.pipelineHasEntities && ticket.stage !== undefined', '  if (ticket.stage !== undefined'),
  },
  {
    name:  'E70: a stage\'s running job holds one slot and a ticket between stages none, so the slot left launches it',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      concurrencyLimit:    2,
      tickets:             [
        crossingTicket(PACKAGE_BUILD),
        ticketOf('002', 'committed', { entity: SHOP.key }),
        ticketOf('003', 'in-progress', { entity: SHOP.key, stage: PACKAGE_BUILD }),
      ],
      jobs: [LIVE_ASSISTANT, jobFixture({
        id: 'J5', ticketIds: ['003'], entity: UI_KIT.key, stage: 2
      })],
      logRecords: HOME_BUILT,
    }), [packageBuildOf('001')]),
  },
  {
    name:  'E71: a ticket between stages launches before a ready ticket of the same priority',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities:         true,
      concurrencyLimit:            1,
      tickets:                     [ticketOf('002', 'committed', { entity: SHOP.key }), crossingTicket(PACKAGE_BUILD)],
      readinessPositionByTicketId: new Map([['002', 1], ['001', 2]]),
      logRecords:                  HOME_BUILT,
    }), [packageBuildOf('001')]),
    mutant: policyLine('review: 0, stage: 1, rebuild: 2, build: 3', 'review: 0, stage: 4, rebuild: 2, build: 3'),
  },
  {
    name:  'E71: a ticket between stages ranks before a rebuild of the same priority',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      concurrencyLimit:    1,
      tickets:             [ticketOf('002', 'in-progress', { entity: SHOP.key }), crossingTicket(PACKAGE_BUILD)],
      logRecords:          [...HOME_BUILT, stagedLaunchedRecord('J2', 'build', '002', SHOP.key, 1), endedRecord('J2', 'failed')],
    }), [packageBuildOf('001')]),
    mutant: policyLine('review: 0, stage: 1, rebuild: 2, build: 3', 'review: 0, stage: 3, rebuild: 2, build: 3'),
  },
  {
    name:  'E72: a stage\'s job names the stage\'s entity, so an entity\'s cap counts it whatever ticket it serves',
    holds: (policy) => {
      const launches = launchesOf(policy.nextStepsOf(entityFacts({ tickets: [crossingTicket(PACKAGE_BUILD)] }), FIXTURE_LIMITS));
      return launches.length === 1 && launches.every((step) => 'entity' in step && step.entity === UI_KIT.key);
    },
    mutant: policyLine('  const launchStage: LaunchStage = { entity: stage.entity,', '  const launchStage: LaunchStage = { entity: ticket.entity ?? \'\','),
  },
  {
    name:  'E73: two tickets cross into one package at once, each launching its own package build',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      tickets:             [crossingTicket(PACKAGE_BUILD), ticketOf('002', 'in-progress', { entity: SHOP.key, stage: PACKAGE_BUILD })],
      logRecords:          [...HOME_BUILT, stagedLaunchedRecord('J2', 'build', '002', SHOP.key, 1), endedRecord('J2', 'built')],
    }), [packageBuildOf('001'), packageBuildOf('002')]),
  },
  {
    name:  'E74: after a restart mid-stage the stage\'s interrupted job waits for User\'s resume, then resumes, and no second job launches',
    holds: (policy) => {
      const factsAfter = (logRecords: readonly LogRecord[]): PlaybookFacts => factsWith({
        pipelineHasEntities: true,
        tickets:             [crossingTicket(PACKAGE_BUILD)],
        jobs:                [LIVE_ASSISTANT, jobFixture({
          id: 'J2', ticketIds: ['001'], state: 'interrupted', interruption: 'reboot', entity: UI_KIT.key, stage: 2
        })],
        logRecords: [...HOME_BUILT, stagedLaunchedRecord('J2', 'build', '001', UI_KIT.key, 2), interruptedRecord('J2', 'reboot'), ...logRecords],
      });
      const waiting = policy.nextStepsOf(factsAfter([]), FIXTURE_LIMITS);
      const resumed = policy.nextStepsOf(factsAfter([resumeInstructedRecord('J2')]), FIXTURE_LIMITS);
      return waiting.length === 0 && Bun.deepEquals(resumed, [{ kind: 'resume-job', jobId: 'J2', instructed: true }], true);
    },
  },
  {
    name:  'E75: a hold between stages holds the ticket',
    holds: (policy) => {
      const heldTicket = crossingTicket(PACKAGE_BUILD, 'in-progress', { hold: 'Alex Example looks first' });
      return launchedTicketIdsOf(policy.nextStepsOf(entityFacts({ tickets: [heldTicket] }), FIXTURE_LIMITS)).length === 0;
    },
  },
  {
    name:  'E75: a stopped stage job\'s successor stays in its stage',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      tickets:             [crossingTicket(PACKAGE_BUILD)],
      logRecords:          [...HOME_BUILT, stagedLaunchedRecord('J2', 'build', '001', UI_KIT.key, 2), endedRecord('J2', 'stopped')],
    }), [packageBuildOf('001', 2)]),
    mutant: policyLine('ticket.stage !== undefined && ticket.status !== \'committed\') return', 'false) return'),
  },
  {
    name:  'E75: a fresh job asked of a stage job, which ends it replaced, launches its successor in the same stage',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      tickets:             [crossingTicket(PACKAGE_BUILD)],
      logRecords:          [...HOME_BUILT, stagedLaunchedRecord('J2', 'build', '001', UI_KIT.key, 2), endedRecord('J2', 'replaced')],
    }), [packageBuildOf('001', 2)]),
    mutant: policyLine('ticket.stage !== undefined && ticket.status !== \'committed\') return', 'false) return'),
  },
  {
    name:  'E17: a package build that wound down at its call budget is relaunched as stage 2 of the package',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      tickets:             [crossingTicket(PACKAGE_BUILD)],
      logRecords:          [...HOME_BUILT, stagedLaunchedRecord('J2', 'build', '001', UI_KIT.key, 2), endedRecord('J2', 'wound-down')],
    }), [packageBuildOf('001', 2)]),
    mutant: policyLine('ticket.stage !== undefined && ticket.status !== \'committed\') return', 'false) return'),
  },
  {
    name:  'E17: an adapt job that wound down at its call budget is relaunched as stage 4 of the home',
    holds: (policy) => launchesExactly(policy, factsWith({
      pipelineHasEntities: true,
      tickets:             [crossingTicket(stageOf('adapt', SHOP.key))],
      logRecords:          [
        ...HOME_BUILT,
        stagedLaunchedRecord('J2', 'build', '001', UI_KIT.key, 2),
        endedRecord('J2', 'built'),
        stagedLaunchedRecord('J4', 'build', '001', SHOP.key, 4),
        endedRecord('J4', 'wound-down'),
      ],
    }), [{
      kind: 'launch-build', ticketId: '001', attempt: 2, base: 'main', entity: SHOP.key, stage: 4
    }]),
    mutant: policyLine('ticket.stage !== undefined && ticket.status !== \'committed\') return', 'false) return'),
  },
  ...(['package-refused', 'second-return', 'dependent-broken', 'whitelist-removed-mid-crossing'] as const).map((kind) => ({
    name:   `${kind === 'whitelist-removed-mid-crossing' ? 'E19: ' : ''}an open ${kind} decision holds the crossing ticket it names`,
    holds:  (policy: typeof Playbook) => launchesExactly(policy, entityFacts({ tickets: [crossingTicket(PACKAGE_BUILD)], decisions: [openDecisionOf(kind)] }), []),
    mutant: policyLine('[\'package-refused\', \'second-return\', \'dependent-broken\', \'whitelist-removed-mid-crossing\']', '[]'),
  })),
  {
    name:  'E94: a committed ticket without an entity launches nothing on a pipeline with entities until it has one',
    holds: (policy) => {
      const withoutAnEntity = factsWith({ pipelineHasEntities: true, tickets: [ticketOf('002', 'committed')] });
      const withAnEntity = factsWith({ pipelineHasEntities: true, tickets: [ticketOf('002', 'committed', SHOP_TICKET)] });
      return launchedTicketIdsOf(policy.nextStepsOf(withoutAnEntity, FIXTURE_LIMITS)).length === 0
        && Bun.deepEquals(launchedTicketIdsOf(policy.nextStepsOf(withAnEntity, FIXTURE_LIMITS)), ['002'], true);
    },
    mutant: policyLine('if (facts.pipelineHasEntities && ticket.entity === undefined) return null;', ''),
  },
  {
    name:  'E94: a forge without entities still launches a committed ticket without an entity',
    holds: (policy) => Bun.deepEquals(launchedTicketIdsOf(policy.nextStepsOf(factsWith({ tickets: [ticketOf('002', 'committed')] }), FIXTURE_LIMITS)), ['002'], true),
  },
  {
    name:  'E76: a usage limit holds a ticket between stages, with no stage rule of its own',
    holds: (policy) => {
      const limits = { ...FIXTURE_LIMITS, usageResetsAt: '2026-10-28T12:00:00+01:00' };
      return launchesOf(policy.nextStepsOf(entityFacts({ tickets: [crossingTicket(PACKAGE_BUILD)] }), limits)).length === 0;
    },
  },
];

function holdsUnder(policy: typeof Playbook, claim: StageClaim): boolean {
  try {
    return claim.holds(policy);
  } catch {
    return false;
  }
}

describe('each stage rule holds as written', () => {
  test.each(CLAIMS.map((claim) => [claim.name, claim] as const))('%s', (_name, claim) => {
    expect(holdsUnder(Playbook, claim)).toBe(true);
  });
});

const MUTATED_CLAIMS = CLAIMS.flatMap((claim) => (claim.mutant === undefined ? [] : [{ name: claim.name, claim, mutant: claim.mutant }]));

describe('each stage rule fails under the mutant of its line', () => {
  test.each(MUTATED_CLAIMS.map((mutated) => [mutated.name, mutated] as const))('%s', async (_name, { claim, mutant }) => {
    const mutatedModule = await mutatedModuleOf(POLICY_MODULE, mutant);
    expect(holdsUnder(mutatedModule['Playbook'] as typeof Playbook, claim)).toBe(false);
  });
});
