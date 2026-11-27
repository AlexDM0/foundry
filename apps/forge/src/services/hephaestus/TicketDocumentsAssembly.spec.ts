/**
 * A ticket's documents and their summary, read from the board: the refusals, who may approve or change a document, the live document agent,
 * the constitution number asked of the ticket's pipeline path, the build held on an unapproved spec or plan, and what moves the fingerprint.
 * Git counts a constitution's commits once per path and commit, and a count git could not give is asked again.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Pipeline }                                   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { LoadedTicketDocumentRecord, TicketDocument } from '../../lib/tracker-model/@types/TicketDocument.ts';
import { PipelineUtil }                                    from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { TicketDocumentVersionUtil }                       from '../../lib/tracker-model/utils/TicketDocumentVersionUtil.ts';
import { OperationRefusal }                                from '../../shared/OperationRefusal.ts';
import { ticketFixture }                                   from '../../testing/BoardFixtures.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                 from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }  from '../../testing/ScratchWorkspace.ts';
import { documentAgentJobFixture }                         from '../../testing/TicketDocumentFixtures.ts';
import { testWhenGitIsRecorded }                           from '../../testing/ToolGuard.ts';
import {
  TicketDocumentsAssembly,
  type ConstitutionNumbers,
  type TicketDocumentsFingerprintSource,
  type TicketDocumentsSource
} from './TicketDocumentsAssembly.ts';
import { liveJobFixture } from './testing/LiveJobFixture.ts';

const AT = '2026-11-24T10:00:00.000Z';
const SPEC_TEXT = '# Example spec\n\n## Acceptance\n\n1. Alex Example sees the basket.\n';
const SPEC_COMMIT = '5'.repeat(40);
const ABSENT_COMMIT = '0123456789abcdef0123456789abcdef01234567';

const APPROVED_SPEC: TicketDocument = {
  kind:     'spec',
  versions: [{
    number: 1, contentHash: TicketDocumentVersionUtil.contentHashOf(SPEC_TEXT), author: 'agent', jobId: 'J4', at: AT, constitutionCommit: SPEC_COMMIT
  }],
  approvals: [{
    number: 1, contentHash: TicketDocumentVersionUtil.contentHashOf(SPEC_TEXT), by: 'person', at: AT, constitutionCommit: SPEC_COMMIT
  }],
  messages:           [],
  proposals:          [],
  proposalMode:       'ask-first',
  nextMessageNumber:  1,
  nextCommentNumber:  1,
  nextProposalNumber: 1,
};

const LOADED_RECORD: LoadedTicketDocumentRecord = {
  record: {
    version: 1, ticketId: '004', openedAt: AT, documents: [APPROVED_SPEC]
  },
  textOfContentHash: { [TicketDocumentVersionUtil.contentHashOf(SPEC_TEXT)]: SPEC_TEXT },
};

function pipelineWith(changes: Partial<Pipeline>): Pipeline {
  return { gates: [], phases: { build: [], review: [], merge: [] }, ...changes } as unknown as Pipeline;
}

function countingConstitutionNumbers(): ConstitutionNumbers & { asked: [string, string][] } {
  const asked: [string, string][] = [];
  return {
    asked,
    numberOf: (constitutionPath, commit) => {
      asked.push([constitutionPath, commit]);
      return 3;
    },
  };
}

function sourceWith(changes: Partial<TicketDocumentsSource>): TicketDocumentsSource {
  return {
    ticket:              ticketFixture({ id: '004', status: 'draft' }),
    loadedRecord:        LOADED_RECORD,
    pipeline:            null,
    jobs:                [],
    effectReadings:      [],
    constitutionNumbers: countingConstitutionNumbers(),
    ...changes,
  };
}

function refusalOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (thrown) {
    if (thrown instanceof OperationRefusal) return thrown.detail;
    throw thrown;
  }
  throw new Error('the reading was not refused');
}

describe('TicketDocumentsAssembly.ticketDocumentsOf', () => {
  test('a ticket with no documents record is refused ticket-has-no-documents', () => {
    expect(refusalOf(() => TicketDocumentsAssembly.ticketDocumentsOf(sourceWith({ loadedRecord: null }))))
      .toEqual({ kind: 'board-refusal', boardRefusal: { reason: 'ticket-has-no-documents', ticketId: '004' } });
  });

  test('User approves and may change a document while its review is on and no agent picked the ticket up', () => {
    const factsOf = (source: TicketDocumentsSource) => TicketDocumentsAssembly.ticketDocumentsOf(source).documents
      .map((document) => [document.document, document.reviewer, document.editable]);
    expect(factsOf(sourceWith({}))).toEqual([['spec', 'person', true], ['plan', 'person', true]]);
    expect(factsOf(sourceWith({ pipeline: pipelineWith({ approvals: { plan: false } }) }))).toEqual([['spec', 'person', true], ['plan', 'pipeline', false]]);
    expect(factsOf(sourceWith({ ticket: ticketFixture({ id: '004', status: 'in-progress' }) }))).toEqual([['spec', 'person', false], ['plan', 'person', false]]);
  });

  test('names the live agent of each document on this ticket, and no job of another document, ticket or kind', () => {
    const jobs = [
      liveJobFixture({
        id: 'J5', kind: 'build', role: 'builder', ticketIds: ['004']
      }),
      liveJobFixture({
        id: 'J6', kind: 'document-agent', role: 'plan-agent', ticketIds: ['009']
      }),
      liveJobFixture({
        id: 'J7', kind: 'document-agent', role: 'spec-agent', ticketIds: ['004']
      }),
    ];
    expect(TicketDocumentsAssembly.ticketDocumentsOf(sourceWith({ jobs })).documents.map((document) => document.agentJobId)).toEqual(['J7', null]);
  });

  test('asks a constitution number of the path the ticket\'s pipeline names, and none without one', () => {
    const constitutionNumbers = countingConstitutionNumbers();
    const pipeline = pipelineWith({ constitution: { path: 'CONSTITUTION.md' } });
    const [spec] = TicketDocumentsAssembly.ticketDocumentsOf(sourceWith({ pipeline, constitutionNumbers })).documents;
    expect(spec?.head?.constitutionNumber).toBe(3);
    expect(spec?.approvals[0]?.constitutionNumber).toBe(3);
    expect(new Set(constitutionNumbers.asked.map((asked) => asked.join(' ')))).toEqual(new Set([`CONSTITUTION.md ${SPEC_COMMIT}`]));
    const withoutConstitution = countingConstitutionNumbers();
    const [defaultSpec] = TicketDocumentsAssembly.ticketDocumentsOf(sourceWith({ constitutionNumbers: withoutConstitution })).documents;
    expect([defaultSpec?.head?.constitutionNumber, withoutConstitution.asked]).toEqual([null, []]);
  });
});

describe('TicketDocumentsAssembly.documentsSummaryOf', () => {
  const committed = ticketFixture({ id: '004', status: 'committed' });

  test('a committed ticket whose plan its builder reads is not approved is held, and one whose builder never reads it is not', () => {
    expect(TicketDocumentsAssembly.documentsSummaryOf(committed.frontmatter, LOADED_RECORD, null)?.buildHeld).toBe(true);
    const planNeverRead = pipelineWith({ agents: { builder: { documents: { plan: 'never' } } } });
    expect(TicketDocumentsAssembly.documentsSummaryOf(committed.frontmatter, LOADED_RECORD, planNeverRead)?.buildHeld).toBe(false);
  });

  test('a ticket that is not committed is never held, and a ticket with no record has no summary', () => {
    expect(TicketDocumentsAssembly.documentsSummaryOf(ticketFixture({ id: '004', status: 'draft' }).frontmatter, LOADED_RECORD, null)).toEqual({
      spec:      { standing: 'approved', headNumber: 1, approvedNumber: 1 },
      plan:      { standing: 'unwritten', headNumber: null, approvedNumber: null },
      buildHeld: false,
    });
    expect(TicketDocumentsAssembly.documentsSummaryOf(committed.frontmatter, null, null)).toBeNull();
  });
});

describe('TicketDocumentsAssembly.fingerprintsOf', () => {
  const sourceOf = (overrides: Partial<TicketDocumentsFingerprintSource> = {}): TicketDocumentsFingerprintSource => ({
    loadedRecords: [LOADED_RECORD], tickets: [ticketFixture({ id: '004', status: 'committed' })], pipeline: null, jobs: [], ...overrides
  });

  test('moves when what is served moves outside the record: the ticket picked up, a review switched off, an agent launched', () => {
    const before = TicketDocumentsAssembly.fingerprintsOf(sourceOf()).get('004');
    const pickedUp = TicketDocumentsAssembly.fingerprintsOf(sourceOf({ tickets: [ticketFixture({ id: '004', status: 'in-progress' })] })).get('004');
    const reviewOff = TicketDocumentsAssembly.fingerprintsOf(sourceOf({ pipeline: { ...PipelineUtil.minimalPipelineOf(), approvals: { spec: false } } })).get('004');
    const withAgent = TicketDocumentsAssembly.fingerprintsOf(sourceOf({ jobs: [documentAgentJobFixture('004', 'spec')] })).get('004');
    expect(new Set([before, pickedUp, reviewOff, withAgent]).size).toBe(4);
    expect(TicketDocumentsAssembly.fingerprintsOf(sourceOf()).get('004')).toBe(before);
  });

  test('keys each record by its ticket, and its fingerprint moves with the record', () => {
    const before = TicketDocumentsAssembly.fingerprintsOf(sourceOf());
    const withMessage: LoadedTicketDocumentRecord = {
      ...LOADED_RECORD,
      record: {
        ...LOADED_RECORD.record,
        documents: [{
          ...APPROVED_SPEC,
          messages: [{
            messageId: 'M1', text: 'Name the total.', from: 'person', state: 'queued', queuedAt: AT
          }]
        }]
      },
    };
    const after = TicketDocumentsAssembly.fingerprintsOf(sourceOf({ loadedRecords: [withMessage] }));
    expect([...before.keys()]).toEqual(['004']);
    expect(after.get('004')).not.toBe(before.get('004'));
  });
});

const recordedGit = useRecordedGit();

let projectDirectory = '';

beforeEach(() => {
  projectDirectory = createScratchDirectory('constitution-numbers');
});

afterEach(() => {
  removeScratchDirectory(projectDirectory);
});

function countAsked(commit: string, answeredAs: typeof GIT_CALL_SHAPES[keyof typeof GIT_CALL_SHAPES]) {
  return { gitArguments: ['rev-list', '--count', '--end-of-options', commit, '--', 'CONSTITUTION.md'], answeredAs };
}

testWhenGitIsRecorded('git counts a constitution\'s commits once per path and commit, and a count it could not give is asked again', async () => {
  const constitutionNumbers = TicketDocumentsAssembly.constitutionNumbersIn(projectDirectory);
  const countedTwo = [countAsked(SPEC_COMMIT, GIT_CALL_SHAPES.COMMITS_OF_A_PATH_TWO)];
  const first = await recordedGit.playStage(countedTwo, async () => constitutionNumbers.numberOf('CONSTITUTION.md', SPEC_COMMIT));
  const again = await recordedGit.playStage([], async () => constitutionNumbers.numberOf('CONSTITUTION.md', SPEC_COMMIT));
  const absent = await recordedGit.playStage([
    countAsked(ABSENT_COMMIT, GIT_CALL_SHAPES.COMMITS_OF_A_PATH_AT_NO_COMMIT),
    countAsked(ABSENT_COMMIT, GIT_CALL_SHAPES.COMMITS_OF_A_PATH_AT_NO_COMMIT),
  ], async () => [constitutionNumbers.numberOf('CONSTITUTION.md', ABSENT_COMMIT), constitutionNumbers.numberOf('CONSTITUTION.md', ABSENT_COMMIT)]);
  expect([first, again, absent]).toEqual([2, 2, [null, null]]);
});
