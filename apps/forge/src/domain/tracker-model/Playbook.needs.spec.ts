/**
 * The Playbook's rules for a need on a pipeline with entities, each watched failing under its line's mutant: an unsettled need holds its
 * ticket, a `needs-declared` build reruns its stage once its needs are delivered, a need's ticket takes the highest waiting priority, and
 * an abandoned need opens a decision that holds the ticket.
 */
import { describe, expect, test } from 'bun:test';

import { mutatedModuleOf, type SourceMutant } from '../../testing/SourceMutant.ts';
import type { Decision }                      from './@types/Decision.ts';
import type { LogRecord }                     from './@types/LogRecord.ts';
import type { PlaybookStep }                  from './@types/PlaybookStep.ts';
import type { PlaybookFacts }                 from './Playbook.ts';
import { Playbook }                           from './Playbook.ts';
import {
  FIXTURE_AT,
  FIXTURE_LIMITS,
  endedRecord,
  factsWith,
  finishedJobRecords,
  launchedTicketIdsOf,
  stagedLaunchedRecord,
  ticketOf
}                                             from './testing/LifecycleFixtures.ts';

const POLICY_MODULE = 'src/domain/tracker-model/Playbook.ts';

interface NeedClaim {
  name:   string;
  facts:  PlaybookFacts;
  holds:  (steps: readonly PlaybookStep[]) => boolean;
  mutant: SourceMutant;
}

function policyLine(find: string, replace: string): SourceMutant {
  return { modulePath: POLICY_MODULE, find, replace };
}

function launchesExactly(ticketIds: readonly string[]): (steps: readonly PlaybookStep[]) => boolean {
  return (steps) => launchedTicketIdsOf(steps).join(' ') === ticketIds.join(' ');
}

/** Ticket `001`'s build `J1` of `web` declared a need, filed as ticket `002` of `design-system`, and ended `needs-declared`. */
const NEED_DECLARED: LogRecord[] = [stagedLaunchedRecord('J1', 'build', '001', 'web', 1), endedRecord('J1', 'needs-declared')];

const WAITING_TICKET = ticketOf('001', 'in-progress', { dependsOn: ['002'], entity: 'web' });

function needTicket(status: Parameters<typeof ticketOf>[1], overrides: Parameters<typeof ticketOf>[2] = {}) {
  return ticketOf('002', status, { filedByJob: 'J1', entity: 'design-system', ...overrides });
}

function needDecision(kind: Decision['kind']): Decision {
  return {
    id: 'E1', kind, ticketIds: ['001'], jobId: null, askedBy: 'hephaestus', requestId: null, questions: [], context: '', openedAt: FIXTURE_AT,
  };
}

const CLAIMS: NeedClaim[] = [
  {
    name:   'on a pipeline with entities a started ticket whose need is unsettled launches nothing',
    facts:  factsWith({ pipelineHasEntities: true, tickets: [WAITING_TICKET, needTicket('in-progress')], logRecords: NEED_DECLARED }),
    holds:  launchesExactly([]),
    mutant: policyLine('  if (facts.pipelineHasEntities && waitsOnADependency(ticket, facts)) return null;\n', ''),
  },
  {
    name:  'on a pipeline with entities a ticket in review with an unsettled dependency gets no review',
    facts: factsWith({
      pipelineHasEntities: true,
      entitiesWithReview:  ['web'],
      tickets:             [ticketOf('001', 'in-review', { dependsOn: ['002'], entity: 'web' }), ticketOf('002', 'committed', { entity: 'design-system' })],
      concurrencyLimit:    1,
    }),
    holds:  launchesExactly(['002']),
    mutant: policyLine('  if (facts.pipelineHasEntities && waitsOnADependency(ticket, facts)) return null;\n', ''),
  },
  {
    name:  'a forge without entities keeps today\'s rebuild and review of a started ticket with an unsettled dependency',
    facts: factsWith({
      tickets:    [ticketOf('001', 'in-progress', { dependsOn: ['003'] }), ticketOf('002', 'in-review', { dependsOn: ['003'] }), ticketOf('003', 'in-progress')],
      logRecords: finishedJobRecords('J1', 'build', '001', 'failed'),
    }),
    holds:  launchesExactly(['002', '001']),
    mutant: policyLine('  if (facts.pipelineHasEntities && waitsOnADependency', '  if (waitsOnADependency'),
  },
  {
    name:   'a need\'s ticket that is only reviewed, so not yet on the main line, still holds the ticket that waits on it',
    facts:  factsWith({ pipelineHasEntities: true, tickets: [WAITING_TICKET, needTicket('reviewed')], logRecords: NEED_DECLARED }),
    holds:  launchesExactly([]),
    mutant: policyLine('  return needTicketIdsOf(ticket, facts).some((needTicketId) => facts.statusById.get(needTicketId) !== NEED_SETTLING_STATUS);\n', '  return false;\n'),
  },
  {
    name:  'once its need is delivered the stage that declared it runs again in the same attempt',
    facts: factsWith({ pipelineHasEntities: true, tickets: [WAITING_TICKET, needTicket('delivered')], logRecords: NEED_DECLARED }),
    holds: (steps) => JSON.stringify(steps) === JSON.stringify([{
      kind: 'launch-build', ticketId: '001', attempt: 1, base: 'main', entity: 'web', stage: 1
    }]),
    mutant: policyLine('returns = record.fields.outcome === \'needs-declared\';', 'returns = false;'),
  },
  {
    name:  'a need\'s ticket runs at the highest priority of the tickets that wait on it',
    facts: factsWith({
      pipelineHasEntities: true,
      tickets:             [{ ...WAITING_TICKET, priority: 'high' }, needTicket('committed', { priority: 'low' }), ticketOf('003', 'committed', { entity: 'web' })],
      logRecords:          NEED_DECLARED,
      concurrencyLimit:    1,
    }),
    holds:  launchesExactly(['002']),
    mutant: policyLine('  if (!facts.pipelineHasEntities) return ownRank;\n', '  return ownRank;\n'),
  },
  {
    name:  'a need of a need runs at the priority of the ticket that waits on both',
    facts: factsWith({
      pipelineHasEntities: true,
      tickets:             [
        { ...WAITING_TICKET, priority: 'high' },
        needTicket('in-progress', { dependsOn: ['004'] }),
        ticketOf('003', 'committed', { entity: 'web' }),
        ticketOf('004', 'committed', { filedByJob: 'J2', priority: 'low', entity: 'design-tokens' }),
      ],
      logRecords:       [...NEED_DECLARED, stagedLaunchedRecord('J2', 'build', '002', 'design-system', 1), endedRecord('J2', 'needs-declared')],
      concurrencyLimit: 1,
    }),
    holds:  launchesExactly(['004']),
    mutant: policyLine('    needTicketIds = waiters.map((waiter) => waiter.id);\n', '    needTicketIds = [];\n'),
  },
  {
    name:  'a worker\'s finding waits on its finder and is no need, so it keeps its own priority',
    facts: factsWith({
      pipelineHasEntities: true,
      entitiesWithReview:  ['web'],
      tickets:             [
        ticketOf('001', 'in-review', { priority: 'high', entity: 'web' }),
        ticketOf('002', 'committed', {
          filedByJob: 'J1', priority: 'low', dependsOn: [], entity: 'web'
        }),
        ticketOf('003', 'committed', { entity: 'web' }),
      ],
      logRecords:       finishedJobRecords('J1', 'build', '001', 'built'),
      concurrencyLimit: 2,
    }),
    holds:  launchesExactly(['001', '003']),
    mutant: policyLine('  return (ticket.dependsOn ?? []).filter((dependencyId) => {', '  return [\'002\'].filter((dependencyId) => {'),
  },
  {
    name:   'an abandoned need\'s ticket leaves the waiting ticket\'s dependencies, which launches nothing in that pass',
    facts:  factsWith({ pipelineHasEntities: true, tickets: [WAITING_TICKET, needTicket('abandoned')], logRecords: NEED_DECLARED }),
    holds:  (steps) => JSON.stringify(steps) === JSON.stringify([{ kind: 'release-abandoned-need', ticketId: '001', needTicketId: '002' }]),
    mutant: policyLine('    .filter((needTicketId) => facts.statusById.get(needTicketId) === \'abandoned\')', '    .filter(() => false)'),
  },
  {
    name:   'a forge without entities never releases an abandoned dependency',
    facts:  factsWith({ tickets: [WAITING_TICKET, needTicket('abandoned')], logRecords: NEED_DECLARED }),
    holds:  (steps) => !steps.some((step) => step.kind === 'release-abandoned-need'),
    mutant: policyLine('  if (!facts.pipelineHasEntities) return [];\n', ''),
  },
  {
    name:  'an open need decision holds the ticket it names',
    facts: factsWith({
      pipelineHasEntities: true, tickets: [ticketOf('001', 'in-progress', { entity: 'web' })], logRecords: NEED_DECLARED, decisions: [needDecision('need-for-root')]
    }),
    holds:  launchesExactly([]),
    mutant: policyLine('\'budget-reached\', \'need-for-root\', ', '\'budget-reached\', '),
  },
];

function holdsUnder(nextStepsOf: typeof Playbook.nextStepsOf, claim: NeedClaim): boolean {
  try {
    return claim.holds(nextStepsOf(claim.facts, FIXTURE_LIMITS));
  } catch {
    return false;
  }
}

describe('each need rule holds as written', () => {
  test.each(CLAIMS.map((claim) => [claim.name, claim] as const))('%s', (_name, claim) => {
    expect(holdsUnder(Playbook.nextStepsOf, claim)).toBe(true);
  });
});

describe('each need rule fails under the mutant of its line', () => {
  test.each(CLAIMS.map((claim) => [claim.name, claim] as const))('%s', async (_name, claim) => {
    const mutated = await mutatedModuleOf(POLICY_MODULE, claim.mutant);
    const policy  = mutated['Playbook'] as typeof Playbook;
    expect(holdsUnder(policy.nextStepsOf, claim)).toBe(false);
  });
});
