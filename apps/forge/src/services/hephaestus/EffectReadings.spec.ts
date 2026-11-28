/**
 * Effect readings, in memory, with an injected clock and recorded git for the main line's tree: the reader's confinement, one job at a time
 * per board outside the agent slots, how its paths are checked against the tree, and when the reading reaches the agent.
 */
import { describe, expect, test } from 'bun:test';

import type { DocumentMessage }                                  from '../../domain/tracker-model/@types/TicketDocument.ts';
import { LaunchSlotUtil }                                        from '../../domain/tracker-model/utils/LaunchSlotUtil.ts';
import type { WorkerProfile }                                    from '../../lib/agent-launch/WorkerProfile.ts';
import type { EffectReadingRequest }                             from '../../shared/@types/EffectReading.ts';
import { boardFixture, ticketFixture, type BoardFixture }        from '../../testing/BoardFixtures.ts';
import { GIT_CALL_SHAPES, useRecordedGit, type RecordedGitStep } from '../../testing/RecordedGit.ts';
import { ticketDocumentRecordFixture }                           from '../../testing/TicketDocumentFixtures.ts';
import { describeWhenGitIsRecorded }                             from '../../testing/ToolGuard.ts';
import { EffectReadings }                                        from './EffectReadings.ts';

const AT = '2026-11-24T12:00:00.000Z';

const PLAN_TEXT = '# Plan\n\nChange `base.ts`.\n';

const MAIN_TREE: RecordedGitStep = { gitArguments: ['ls-tree', '-r', '-z', '--full-tree', 'main'], answeredAs: GIT_CALL_SHAPES.TREE_OF_THE_LANDING_BASE };

const recordedGit = useRecordedGit();

const REQUEST: EffectReadingRequest = {
  ticketId: '004', document: 'plan', versionNumber: 1, requestedByAgent: false
};

interface ReadingsFixture extends BoardFixture {
  readings:       ReturnType<typeof EffectReadings.createEffectReadings>;
  advance:        (milliseconds: number) => void;
  wakes:          () => number;
  changedTickets: string[];
  boardMessages:  () => readonly DocumentMessage[];
}

function readingsFixture(): ReadingsFixture {
  const fixture = boardFixture({
    tickets:               [ticketFixture({ id: '004', status: 'draft' })],
    ticketDocumentRecords: [ticketDocumentRecordFixture('004', [{ kind: 'plan', texts: [PLAN_TEXT] }])],
  });
  fixture.progress.jobs = [];
  let now = 1_000;
  let wakeCount = 0;
  const readings = EffectReadings.createEffectReadings({ wake: () => { wakeCount += 1; }, nowMilliseconds: () => now, timeoutMilliseconds: 60_000 });
  const changedTickets: string[] = [];
  readings.onChanged((ticketId) => changedTickets.push(ticketId));
  const boardMessages = (): readonly DocumentMessage[] => (fixture.board.ticketDocuments().documentOf('004', 'plan')?.messages ?? [])
    .filter((message) => message.from === 'board');
  return {
    ...fixture, readings, advance: (milliseconds) => { now += milliseconds; }, wakes: () => wakeCount, changedTickets, boardMessages
  };
}

const REPORT = {
  references: [{ reference: 1, lines: { from: 3, to: 3 }, quote: 'Change `base.ts`.' }],
  entries:    [
    {
      reference: 1, path: 'base.ts', change: 'changes', detail: 'The base changes.', candidates: []
    },
    {
      reference: 1, path: 'src/Missing.ts', change: 'removes', detail: 'Gone.', candidates: []
    },
    {
      reference: 1, path: 'Basket.ts', change: 'unresolved', detail: 'Which one?', candidates: ['web/Basket.ts', 'api/Basket.ts']
    },
    {
      reference: 1, path: 'src/New.ts', change: 'adds', detail: 'A new file.', candidates: []
    },
  ],
};

describe('the reader\'s profile', () => {
  test('denies the repository root and the data folder, keeps every instruction file up to the root away, and gives no tool, network or question', () => {
    const sessionProfile = {
      deniedReadableRoots: ['/home/example/.ssh'], shellNetworkDomains: ['example.com'], webNetworkDomains: 'any', askUser: true, skills: true
    } as unknown as WorkerProfile;
    const sessionFolder = '/example/repository/.claude/worktrees/sessions/J7';
    expect(EffectReadings.effectReaderProfileOf(sessionProfile, '/example/repository', '/example/repository/.forge', sessionFolder)).toMatchObject({
      deniedReadableRoots:     ['/home/example/.ssh', '/example/repository', '/example/repository/.forge'],
      instructionsRoot:        sessionFolder,
      nestedCheckoutAncestors: [
        sessionFolder, '/example/repository/.claude/worktrees/sessions', '/example/repository/.claude/worktrees', '/example/repository/.claude', '/example/repository'
      ],
      shellNetworkDomains: [],
      webNetworkDomains:   'none',
      askUser:             false,
      skills:              false,
      availableTools:      'none',
    });
  });
});

describe('a request', () => {
  test('reads `reading` at once, wakes a pass, and launches one job that holds no agent slot', () => {
    const fixture = readingsFixture();
    fixture.readings.request(REQUEST);

    expect(fixture.readings.readingsOf('004')).toEqual([{
      ticketId: '004', document: 'plan', versionNumber: 1, state: 'reading', durationMilliseconds: null, references: [], entries: []
    }]);
    expect(fixture.wakes()).toBe(1);
    expect(fixture.changedTickets).toEqual(['004']);

    fixture.readings.launchDue(fixture.board, AT);
    const [job] = fixture.board.jobs();
    expect([job?.kind, job?.role, job?.ticketIds]).toEqual(['effect-reading', 'effect-reader', ['004']]);
    expect(LaunchSlotUtil.slotJobIdsOf(fixture.board.jobs())).toEqual([]);
  });

  test('one reading runs at a time per board: a second request waits for the first to end', () => {
    const fixture = readingsFixture();
    fixture.readings.request(REQUEST);
    fixture.readings.launchDue(fixture.board, AT);
    fixture.readings.request({ ...REQUEST, document: 'spec' });
    fixture.readings.launchDue(fixture.board, AT);
    expect(fixture.board.jobs()).toHaveLength(1);
  });
});

describeWhenGitIsRecorded('a settled reading', () => {
  test('checks each path against the main line\'s tree and ends the job closed, with no message to an agent that did not ask', async () => {
    const fixture = readingsFixture();
    fixture.readings.request(REQUEST);
    fixture.readings.launchDue(fixture.board, AT);
    const job = fixture.board.jobs()[0];
    if (job === undefined) throw new Error('no job launched');

    const facts = await recordedGit.playStage([MAIN_TREE], () => Promise.resolve(fixture.readings.factsOf(fixture.board, job, '/example/repository', 'main')));
    expect(facts).toMatchObject({
      document: 'plan', versionNumber: 1, versionText: PLAN_TEXT, pathsCut: false
    });
    expect(facts?.paths).toContain('base.ts');

    fixture.advance(1_400);
    fixture.readings.settle(fixture.board, job.id, REPORT, AT);

    const [reading] = fixture.readings.readingsOf('004');
    expect(reading).toMatchObject({ state: 'read', durationMilliseconds: 1_400 });
    expect(reading?.entries.map((entry) => [entry.path, entry.change, entry.unresolvedReason])).toEqual([
      ['base.ts', 'changes', null],
      ['src/Missing.ts', 'unresolved', 'no-match'],
      ['Basket.ts', 'unresolved', 'ambiguous'],
      ['src/New.ts', 'adds', null],
    ]);
    expect(fixture.records.findLast((record) => record.kind === 'job-ended')).toMatchObject({ jobId: job.id, fields: { outcome: 'closed' } });
    expect(fixture.boardMessages()).toEqual([]);
  });

  test('goes to the agent that asked as a board message holding the reading as data', async () => {
    const fixture = readingsFixture();
    fixture.readings.request({ ...REQUEST, requestedByAgent: true });
    fixture.readings.launchDue(fixture.board, AT);
    const job = fixture.board.jobs()[0];
    if (job === undefined) throw new Error('no job launched');
    await recordedGit.playStage([MAIN_TREE], () => Promise.resolve(fixture.readings.factsOf(fixture.board, job, '/example/repository', 'main')));

    fixture.readings.settle(fixture.board, job.id, REPORT, AT);

    const [message] = fixture.boardMessages();
    expect(message).toMatchObject({ messageId: 'M1', state: 'queued', queuedAt: AT });
    expect(JSON.parse(message?.text ?? '')).toMatchObject({ effectReading: { document: 'plan', version: 1, state: 'read' } });
    expect(fixture.board.changedTicketDocumentRecords().map((loadedRecord) => loadedRecord.record.ticketId)).toEqual(['004']);
  });
});

describe('a failed reading', () => {
  test('a report not of its schema fails the reading and the job', () => {
    const fixture = readingsFixture();
    fixture.readings.request(REQUEST);
    fixture.readings.launchDue(fixture.board, AT);
    fixture.readings.settle(fixture.board, fixture.board.jobs()[0]?.id ?? '', { references: [], entries: [], summary: 'none' }, AT);
    expect(fixture.readings.readingsOf('004')[0]?.state).toBe('failed');
    expect(fixture.records.findLast((record) => record.kind === 'job-ended')).toMatchObject({ fields: { outcome: 'failed' } });
  });

  test('a reading past its time, and one whose session ended with no result, fail and are named for their session to stop', () => {
    const fixture = readingsFixture();
    fixture.readings.request(REQUEST);
    fixture.readings.launchDue(fixture.board, AT);
    const jobId = fixture.board.jobs()[0]?.id ?? '';

    expect(fixture.readings.failOverdue(fixture.board, [], AT)).toEqual([]);
    fixture.advance(60_000);
    expect(fixture.readings.failOverdue(fixture.board, [], AT)).toEqual([jobId]);
    expect(fixture.readings.readingsOf('004')[0]?.state).toBe('failed');

    fixture.readings.request(REQUEST);
    fixture.readings.launchDue(fixture.board, AT);
    const secondJobId = fixture.board.jobs()[0]?.id ?? '';
    expect(fixture.readings.failOverdue(fixture.board, [secondJobId], AT)).toEqual([secondJobId]);
    expect(fixture.board.jobs()).toEqual([]);
  });

  test('a failed reading the agent asked for still reaches it as a board message, past its time or with its session ended', () => {
    const fixture = readingsFixture();
    fixture.readings.request({ ...REQUEST, requestedByAgent: true });
    fixture.readings.launchDue(fixture.board, AT);
    fixture.advance(60_000);

    fixture.readings.failOverdue(fixture.board, [], AT);

    expect(fixture.boardMessages()).toHaveLength(1);
    expect(JSON.parse(fixture.boardMessages()[0]?.text ?? '{}')).toMatchObject({ effectReading: { document: 'plan', version: 1, state: 'failed' } });
  });

  test('a reading launched in a hold that was refused is asked again, never left reading with no job', () => {
    const fixture = readingsFixture();
    fixture.readings.request(REQUEST);
    const refusedHold = boardFixture({
      tickets:               [ticketFixture({ id: '004', status: 'draft' })],
      ticketDocumentRecords: [ticketDocumentRecordFixture('004', [{ kind: 'plan', texts: [PLAN_TEXT] }])],
    });
    refusedHold.progress.jobs = [];
    fixture.readings.launchDue(refusedHold.board, AT);

    expect(fixture.readings.failOverdue(fixture.board, [], AT)).toEqual([]);
    fixture.readings.launchDue(fixture.board, AT);
    expect(fixture.board.jobs().map((job) => job.kind)).toEqual(['effect-reading']);
    expect(fixture.readings.readingsOf('004')[0]?.state).toBe('reading');
  });

  test('a reading job no request of this Hephaestus names, as after a restart, ends failed', () => {
    const fixture = readingsFixture();
    fixture.board.launchJob({
      kind: 'effect-reading', role: 'effect-reader', ticketIds: ['004'], parentJobId: null, attempt: 1, target: null
    }, AT);
    expect(fixture.readings.failOverdue(fixture.board, [], AT)).toHaveLength(1);
    expect(fixture.board.jobs()).toEqual([]);
  });
});
