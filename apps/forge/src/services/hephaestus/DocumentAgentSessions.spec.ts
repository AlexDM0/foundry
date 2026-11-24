/**
 * A spec or plan agent's session as Hephaestus runs it, with the session's readings given as values and a planted child. What matters:
 * its profile writes only its Hatch, with no network, question or skill; its first message's facts ask for a first write, a plan's update
 * for a newer spec with that spec's text, or a read of the head; one message goes out at a time, only while the agent is idle, oldest
 * first, never a withdrawn one; the line carries the comment's lines at the head, the version it was sent on and an orphan's quote; an idle
 * agent with nothing queued has its input closed and then waits, or ends `closed` once its document is approved; an instance resumed from
 * waiting opens with the next message; and a turn end whose snapshot fails Customs refuses the turn's requests, logs it, opens one
 * incident on the ticket and ends the job `failed`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join }                                 from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { HatchFormatUtil }                                                              from '../../adapters/hatch/utils/HatchFormatUtil.ts';
import type { WorkerProfile }                                                           from '../../lib/agent-launch/WorkerProfile.ts';
import type { ChildInput }                                                              from '../../lib/talos/@types/TalosFrame.ts';
import type { Job }                                                                     from '../../lib/tracker-model/@types/Job.ts';
import type { TicketStatus }                                                            from '../../lib/tracker-model/@types/Ticket.ts';
import type { LoadedTicketDocumentRecord }                                              from '../../lib/tracker-model/@types/TicketDocument.ts';
import type { BoardRefusalDetail }                                                      from '../../lib/tracker-model/BoardRefusal.ts';
import { boardFixture, ticketFixture, type BoardFixture }                               from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                                                       from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS }                         from '../../testing/FixtureRecordAllocation.ts';
import { createScratchDirectory, removeScratchDirectory }                               from '../../testing/ScratchWorkspace.ts';
import { documentAgentJobFixture, documentMessageFixture, ticketDocumentRecordFixture } from '../../testing/TicketDocumentFixtures.ts';
import type { BoardTransaction }                                                        from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                                            from '../tracker/Workspace.ts';
import type { BoardChildren }                                                           from './BoardChildren.ts';
import { DocumentAgentSessions }                                                        from './DocumentAgentSessions.ts';
import { jobFolderIn }                                                                  from './HephaestusFiles.ts';

const AT = '2026-11-24T12:00:00.000Z';

const SPEC_TEXT = '# Basket\n\n## Outcome\n\nAlex Example sees the total.\n\n## Acceptance\n\n1. The total shows.\n';

const NEWER_SPEC_TEXT = `${SPEC_TEXT}2. The total updates.\n`;

const PLAN_TEXT = '# Plan\n\nChange `src/Basket.ts`.\n';

const scratchFolders: string[] = [];

afterEach(() => {
  for (const folder of scratchFolders.splice(0)) removeScratchDirectory(folder);
});

interface SessionFixture extends BoardFixture {
  rootDirectory:    string;
  trackerDirectory: string;
  children:         BoardChildren;
  sentLines:        () => string[];
}

function sessionFixture(record: LoadedTicketDocumentRecord, jobs: Job[], status: TicketStatus = 'draft'): SessionFixture {
  const rootDirectory = createScratchDirectory('document-agent-sessions');
  scratchFolders.push(rootDirectory);
  const { trackerDirectory } = workspacePathsFor(rootDirectory);
  const fixture = boardFixture({ tickets: [ticketFixture({ id: '004', status, title: 'Show the basket total' })], ticketDocumentRecords: [record] });
  fixture.progress.jobs = jobs;
  const inputs: ChildInput[] = [];
  const children = {
    jobFolderOf:   (jobId: string) => jobFolderIn(trackerDirectory, jobId),
    livenessOf:    () => ({ verdict: 'live' }),
    sendInputOnce: (markerPath: string, _folder: string, _instance: number, sent: readonly ChildInput[]) => {
      if (existsSync(markerPath)) return Promise.resolve(true);
      inputs.push(...sent);
      writeFileSync(markerPath, '');
      return Promise.resolve(true);
    },
  } as unknown as BoardChildren;
  const sentLines = (): string[] => inputs.flatMap((input) => (input.act === 'write-line' ? [input.line] : []));
  return {
    ...fixture, rootDirectory, trackerDirectory, children, sentLines
  };
}

/** The first message of instance 1 was taken, as `JobResumption.deliverFirstMessages` marks it, and the launch noted. */
function launched(fixture: SessionFixture, job: Readonly<Job>): void {
  DocumentAgentSessions.noteLaunch(fixture.trackerDirectory, fixture.board, job);
  writeFileSync(join(jobFolderIn(fixture.trackerDirectory, job.id), 'first-message-1.sent'), '');
}

const CHAT_ADAPTER = { chatLineOf: (text: string) => text };

const SPEC_WITH_MESSAGES = ticketDocumentRecordFixture('004', [{
  kind:     'spec',
  texts:    [SPEC_TEXT],
  messages: [
    documentMessageFixture('M1', { state: 'withdrawn' }),
    documentMessageFixture('M2', {
      commentNumber: 2,
      anchor:        {
        view:             'preview',
        versionNumber:    1,
        lines:            { from: 5, to: 5 },
        columns:          { from: 1, to: 12 },
        sectionPath:      ['Outcome'],
        quote:            'Alex Example',
        surroundingLines: { from: 3, to: 7 },
      },
      placement: { from: 5, to: 5 },
    }),
    documentMessageFixture('M3', { text: 'Name the total in the Acceptance.' }),
  ],
}]);

describe('the profile and the first message', () => {
  test('the agent writes only its Hatch, with no network, question or skill', () => {
    const sessionProfile = {
      writableRoots: ['/example/checkout'], shellNetworkDomains: ['example.com'], webNetworkDomains: 'any', askUser: true, skills: true
    } as unknown as WorkerProfile;
    const profile = DocumentAgentSessions.documentAgentProfileOf(sessionProfile, '/example/hatch/J9');
    expect(profile).toMatchObject({
      writableRoots: ['/example/hatch/J9'], shellNetworkDomains: [], webNetworkDomains: 'none', askUser: false, skills: false, networkDomainGuard: null
    });
  });

  test('a spec with no version asks for the first write, with the ticket and no head', () => {
    const fixture = sessionFixture(ticketDocumentRecordFixture('004', []), []);
    expect(DocumentAgentSessions.documentAgentFactsOf(fixture.board, documentAgentJobFixture('004', 'spec'))).toEqual({
      document:     'spec',
      ticket:       { id: '004', title: 'Show the basket total', body: fixture.board.tickets()[0]?.body ?? '' },
      request:      'write',
      head:         null,
      approvedSpec: null,
    });
  });

  test('an out-of-date plan asks for an update for the newer approved spec, whose text it carries', () => {
    const record = ticketDocumentRecordFixture('004', [
      { kind: 'spec', texts: [SPEC_TEXT, NEWER_SPEC_TEXT], approvals: [{ number: 1 }, { number: 2 }] },
      { kind: 'plan', texts: [PLAN_TEXT], approvals: [{ number: 1, onSpecText: SPEC_TEXT }] },
    ]);
    const facts = DocumentAgentSessions.documentAgentFactsOf(sessionFixture(record, []).board, documentAgentJobFixture('004', 'plan'));
    expect(facts).toMatchObject({ request: 'update', head: { versionNumber: 1, text: PLAN_TEXT }, approvedSpec: { versionNumber: 2, text: NEWER_SPEC_TEXT } });
  });

  test('a job of another kind has no document agent facts', () => {
    const fixture = sessionFixture(ticketDocumentRecordFixture('004', []), []);
    expect(DocumentAgentSessions.documentAgentFactsOf(fixture.board, documentAgentJobFixture('004', 'spec', { kind: 'build', role: 'builder' }))).toBeNull();
  });
});

describe('the messages', () => {
  test('an idle agent takes the oldest queued message, never a withdrawn one, and only one per turn', async () => {
    const job     = documentAgentJobFixture('004', 'spec');
    const fixture = sessionFixture(structuredClone(SPEC_WITH_MESSAGES), [job]);
    launched(fixture, job);

    DocumentAgentSessions.deliverWhenIdle(fixture.board, [{ jobId: 'J9', instance: 1, results: 1 }], fixture.trackerDirectory, [], AT);
    DocumentAgentSessions.deliverWhenIdle(fixture.board, [{ jobId: 'J9', instance: 1, results: 1 }], fixture.trackerDirectory, [], AT);
    await DocumentAgentSessions.sendDeliveries(fixture.children, fixture.trackerDirectory, fixture.board, CHAT_ADAPTER);

    const messages = fixture.board.ticketDocuments().documentOf('004', 'spec')?.messages ?? [];
    expect(messages.map((message) => [message.messageId, message.state, message.deliveryNumber, message.agentTurn]))
      .toEqual([['M1', 'withdrawn', undefined, undefined], ['M2', 'sent', 1, 2], ['M3', 'queued', undefined, undefined]]);
    expect(fixture.sentLines()).toHaveLength(1);
  });

  test('an agent mid-turn takes nothing', () => {
    const job     = documentAgentJobFixture('004', 'spec');
    const fixture = sessionFixture(structuredClone(SPEC_WITH_MESSAGES), [job]);
    launched(fixture, job);
    DocumentAgentSessions.deliverWhenIdle(fixture.board, [{ jobId: 'J9', instance: 1, results: 0 }], fixture.trackerDirectory, [], AT);
    expect(fixture.board.ticketDocuments().nextQueuedMessageOf('004', 'spec')?.messageId).toBe('M2');
    expect(fixture.board.jobById('J9')?.state).toBe('running');
  });

  test('the line carries the comment\'s lines at the head, the version it was sent on and its surrounding lines, once', async () => {
    const job     = documentAgentJobFixture('004', 'spec');
    const fixture = sessionFixture(structuredClone(SPEC_WITH_MESSAGES), [job]);
    launched(fixture, job);
    DocumentAgentSessions.deliverWhenIdle(fixture.board, [{ jobId: 'J9', instance: 1, results: 1 }], fixture.trackerDirectory, [], AT);

    await DocumentAgentSessions.sendDeliveries(fixture.children, fixture.trackerDirectory, fixture.board, CHAT_ADAPTER);
    await DocumentAgentSessions.sendDeliveries(fixture.children, fixture.trackerDirectory, fixture.board, CHAT_ADAPTER);

    expect(fixture.sentLines().map((line) => JSON.parse(line) as unknown)).toEqual([{
      comment:       'C2',
      view:          'preview',
      document:      'spec',
      version:       1,
      sentOnVersion: 1,
      lines:         [5, 5],
      columns:       [1, 12],
      section:       ['Outcome'],
      quote:         'Alex Example',
      around:        [3, 7],
      text:          'Example comment M2',
    }]);
  });

  test('an idle agent with nothing queued has its input closed, then waits for its next message', () => {
    const job     = documentAgentJobFixture('004', 'spec');
    const fixture = sessionFixture(ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC_TEXT] }]), [job]);
    launched(fixture, job);

    DocumentAgentSessions.deliverWhenIdle(fixture.board, [{ jobId: 'J9', instance: 1, results: 1 }], fixture.trackerDirectory, [], AT);
    expect(fixture.board.jobById('J9')?.state).toBe('stopping');

    DocumentAgentSessions.settleEndedSession(fixture.board, fixture.board.jobById('J9') ?? job, AT);
    expect(fixture.board.jobById('J9')?.state).toBe('awaiting-answer');
  });

  test('an agent whose document is approved with no edit open ends closed, waiting or once its session ended', () => {
    const approved = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC_TEXT], approvals: [{ number: 1 }] }]);
    const waiting  = sessionFixture(approved, [documentAgentJobFixture('004', 'spec', { state: 'awaiting-answer' })]);
    DocumentAgentSessions.deliverWhenIdle(waiting.board, [], waiting.trackerDirectory, [], AT);
    expect(waiting.board.jobs()).toEqual([]);

    const stopping = sessionFixture(structuredClone(approved), [documentAgentJobFixture('004', 'spec', { state: 'stopping' })]);
    DocumentAgentSessions.settleEndedSession(stopping.board, stopping.board.jobById('J9') ?? documentAgentJobFixture('004', 'spec'), AT);
    expect(stopping.records.findLast((record) => record.kind === 'job-ended')).toMatchObject({ jobId: 'J9', fields: { outcome: 'closed' } });
  });

  test('an instance resumed from waiting opens with the next message in place of the resume line', async () => {
    const job     = documentAgentJobFixture('004', 'spec', { childInstance: 2 });
    const fixture = sessionFixture(structuredClone(SPEC_WITH_MESSAGES), [job]);
    launched(fixture, job);

    DocumentAgentSessions.deliverWhenIdle(fixture.board, [], fixture.trackerDirectory, ['J9'], AT);

    expect(DocumentAgentSessions.opensWithAMessage(fixture.trackerDirectory, fixture.board, job)).toBe(true);
    await DocumentAgentSessions.sendDeliveries(fixture.children, fixture.trackerDirectory, fixture.board, CHAT_ADAPTER);
    expect(fixture.sentLines()).toHaveLength(1);
    expect(DocumentAgentSessions.opensWithAMessage(fixture.trackerDirectory, fixture.board, job)).toBe(false);
  });
});

describe('a turn end whose snapshot fails Customs', () => {
  test('refuses the turn\'s requests, logs it, opens one incident on the ticket and ends the job failed', () => {
    const job     = documentAgentJobFixture('004', 'spec');
    const fixture = sessionFixture(ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC_TEXT] }]), [job]);
    const change: BoardTransaction = {
      board:                          fixture.board,
      workspace:                      workspacePathsFor(fixture.rootDirectory),
      at:                             AT,
      records:                        createFixtureRecordAllocation(fixture.board),
      unreadableRecords:              NO_UNREADABLE_RECORDS,
      unreadablePipeline:             null,
      storedLogEntryCount:            0,
      storedLogRecords:               [],
      deleteAllTicketFilesAfterwards: () => undefined,
    };
    mkdirSync(jobFolderIn(fixture.trackerDirectory, 'J9'), { recursive: true });
    const request = { jobId: 'J9', requestId: 'R1', text: JSON.stringify(HatchFormatUtil.requestOf('R1', { kind: 'ticket-document-agent-ready' })) };
    const context = {
      workspace:     workspacePathsFor(fixture.rootDirectory),
      worktreesRoot: join(fixture.rootDirectory, 'worktrees'),
      branchNames:   { ticketBranchOf: (ticketId: string) => `ticket/${ticketId}`, groupTargetPrefix: 'group/' },
      mainLine:      'main',
      pathStyle:     { pathsCompareFolded: false },
      agentNaming:   { configurationNames: { folderNames: [], fileNames: [] }, attributionPatterns: [] },
    } as unknown as Parameters<typeof DocumentAgentSessions.verifyTurnEnds>[1];

    const replies = DocumentAgentSessions.verifyTurnEnds(change, context, ['J9', 'J9'], [request], ECHOED_CONTROL_CONTEXT);

    const refusal: BoardRefusalDetail = {
      reason: 'document-snapshot-touched', ticketId: '004', document: 'spec', jobId: 'J9', checks: ['V16']
    };
    expect(replies.map((reply) => reply.reply)).toEqual([{
      hatchFormatVersion: 1, requestId: 'R1', outcome: 'refused', status: 'refused', detail: { kind: 'board-refusal', boardRefusal: refusal }
    }]);
    expect(fixture.records.filter((record) => record.kind === 'ticket-document-snapshot-touched')).toEqual([{
      kind: 'ticket-document-snapshot-touched', ticketId: '004', fields: { document: 'spec', jobId: 'J9', checks: ['V16'] }, at: AT
    }]);
    expect(fixture.board.incidents().map((incident) => [incident.kind, incident.ticketIds, incident.jobId])).toEqual([['document-snapshot-touched', ['004'], 'J9']]);
    expect(fixture.board.jobs()).toEqual([]);
  });
});
