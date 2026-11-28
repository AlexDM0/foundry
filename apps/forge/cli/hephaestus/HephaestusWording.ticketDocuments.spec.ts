/**
 * The ticket's documents in a builder's or a reviewer's brief. What matters: the brief ends with each document the role reads, under the
 * section that says the plan takes the place of the Brief and a later document wins, each with its version and approver; a ticket
 * without documents gets no such section.
 */
import { readFileSync }           from 'node:fs';
import { describe, expect, test } from 'bun:test';

import type { Job }            from '../../src/domain/tracker-model/@types/Job.ts';
import type { JobLaunchFacts } from '../../src/services/hephaestus/@types/JobLaunchFacts.ts';
import { resourceFilePathOf }  from '../../src/shared/ResourceFilePath.ts';
import { fakeAgentAdapter }    from '../../src/testing/FakeAgentAdapter.ts';
import { HephaestusWording }   from './HephaestusWording.ts';

const SPEC = '## Acceptance\n\nA1. The basket shows.\n';
const PLAN = '## Files\n\nWork belongs in: src/Basket.ts\n';

const BUILD_JOB = {
  id: 'J4', kind: 'build', role: 'builder', ticketIds: ['004'], attempt: 1
} as unknown as Readonly<Job>;

function buildMessageWith(documents: JobLaunchFacts['tickets'][number]['documents']): string {
  const facts: JobLaunchFacts = {
    confinement: 'confined',
    tickets:     [{
      id: '004', title: 'Example basket', body: '## Report\nEmpty basket.\n', branch: 'ticket-004', ...(documents === undefined ? {} : { documents })
    }],
    checksLine:             null,
    gates:                  null,
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    instructions:           readFileSync(resourceFilePathOf('prompts', 'BuildPrompt.md'), 'utf8'),
  };
  return HephaestusWording.launchTextOf(BUILD_JOB, facts, fakeAgentAdapter().promptFills).firstMessage;
}

describe('the ticket documents in the brief', () => {
  test('come after the filled brief, each with its version and approver', () => {
    const message = buildMessageWith([
      {
        document: 'spec', versionNumber: 2, contentHash: 'a', approvedBy: 'person', text: SPEC
      },
      {
        document: 'plan', versionNumber: 1, contentHash: 'b', approvedBy: 'pipeline', text: PLAN
      },
    ]);
    expect(message).toContain('## The ticket documents');
    expect(message).toContain('it takes\nthe place of the Brief');
    expect(message).toContain(`### Spec, version 2, approved by User\n\n${SPEC.trim()}`);
    expect(message).toContain(`### Plan, version 1, approved by the pipeline\n\n${PLAN.trim()}`);
    expect(message.indexOf('## The ticket documents')).toBeGreaterThan(message.indexOf('Empty basket.'));
  });

  test('are absent for a ticket without documents', () => {
    expect(buildMessageWith(undefined)).not.toContain('## The ticket documents');
  });
});
