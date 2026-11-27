/**
 * The Assistant's turns on a board, with its session's readings given as values: when incidents and User's messages go out, when a turn
 * closes and its incidents default, how one that went down or winds down ends, and that every move outside its incidents is refused.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { IncidentOpening }                                              from '../../lib/tracker-model/@types/Incident.ts';
import type { Job }                                                          from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                                    from '../../lib/tracker-model/@types/LogRecord.ts';
import type { PlaybookObservations }                                         from '../../lib/tracker-model/@types/PlaybookStep.ts';
import { Board }                                                             from '../../lib/tracker-model/Board.ts';
import { createLogger }                                                      from '../../lib/tracker-model/Logger.ts';
import type { ControlCommand }                                               from '../../shared/@types/ControlCommand.ts';
import { ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH, ASSISTANT_TURN_CALL_BUDGET } from '../../shared/constants/HephaestusLimits.ts';
import { LIFECYCLE_LIMITS }                                                  from '../../shared/constants/LifecycleLimits.ts';
import { ticketFixture }                                                     from '../../testing/BoardFixtures.ts';
import { createScratchDirectory, removeScratchDirectory }                    from '../../testing/ScratchWorkspace.ts';
import { Bouncer }                                                           from '../control/Bouncer.ts';
import { type AssistantReading, AssistantSession }                           from './AssistantSession.ts';
import type { BoardChildren }                                                from './BoardChildren.ts';
import { jobFolderIn }                                                       from './HephaestusFiles.ts';

const FIXTURE_AT = '2026-10-28T10:00:00+01:00';

const FIXTURE_LIMITS = { ...LIFECYCLE_LIMITS, now: FIXTURE_AT, usageResetsAt: null };

const FIXTURE_OBSERVATIONS: PlaybookObservations = {
  mainLine:                     'main',
  groupTargetPrefix:            'group-',
  installVersionChanged:        false,
  ticketIdsTouchingAgentConfig: [],
  closedDeliveryTurns:          [],
  budgetSpentDeliveryTurns:     [],
  assistantHasAnswered:         false,
  assistantBootRetryDue:        false,
};

const ASSISTANT_ID = 'J900';

const LIVE_ASSISTANT: Job = {
  id:                 ASSISTANT_ID,
  kind:               'assistant',
  role:               'assistant',
  ticketIds:          [],
  parentJobId:        null,
  attempt:            1,
  target:             null,
  state:              'running',
  childInstance:      1,
  eventCursor:        { instance: 1, sequence: 0 },
  answeredRequestIds: [],
  crashResumes:       0,
};

function failedBootRecords(jobId: string): LogRecord[] {
  return [
    {
      kind:   'job-launched',
      jobId,
      fields: {
        kind: 'assistant', role: 'assistant', ticketIds: [], attempt: 1, target: null, parentJobId: null
      },
      at: FIXTURE_AT,
    },
    {
      kind: 'job-ended', jobId, fields: { outcome: 'failed', deniedPermissions: [] }, at: FIXTURE_AT
    },
  ];
}

const WORDING = {
  questions: [{
    question: 'Carry on?', header: 'Carry on', multiSelect: false, options: []
  }],
  context: ''
};

const BLOCKED: IncidentOpening = {
  kind: 'blocked', ticketIds: ['001'], jobId: null, facts: {}, defaultMove: 'ticket-park'
};

function assistantBoard(storedLogRecords: LogRecord[] = [], jobs: Job[] = [{ ...LIVE_ASSISTANT }]): { board: Board; records: LogRecord[] } {
  const records: LogRecord[] = [];
  const board = new Board({
    progress: {
      trackerId:        'example-tracker-id',
      project:          'Example Agency',
      startedAt:        FIXTURE_AT,
      view:             { kind: 'auto' },
      nextTaskId:       1,
      concurrencyLimit: 4,
      hephaestusState:  'paused',
      nextJobId:        901,
      jobs,
      tasks:            [],
    },
    tickets:  [ticketFixture({ id: '001', status: 'in-progress' }), ticketFixture({ id: '002', status: 'in-progress' })],
    epics:    [],
    logger:   createLogger((record) => records.push(record)),
    storedLogRecords,
    pipeline: {
      version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }, assistant: true
    },
  });
  return { board, records };
}

function readingOf(results: number, overrides: Partial<AssistantReading> = {}): AssistantReading {
  return {
    jobId: ASSISTANT_ID, instance: 1, results, callsSinceLastResult: 0, lastContextTokens: null, ...overrides
  };
}

function advance(board: Board, readings: readonly AssistantReading[], overrides: Partial<PlaybookObservations> = {}): void {
  board.followPlaybook(FIXTURE_LIMITS, { ...FIXTURE_OBSERVATIONS, ...AssistantSession.turnObservationsOf(board, readings), ...overrides }, () => WORDING);
}

const scratch = createScratchDirectory('assistant-session');

/** As a pass does after the lifecycle: the input of an idle Assistant that is due closes, then an idle one takes the open incidents. */
function deliverWhenIdle(board: Board, readings: readonly AssistantReading[]): void {
  AssistantSession.closeInputWhenIdle(board, readings, scratch, FIXTURE_AT);
  AssistantSession.deliverIncidentsWhenIdle(board, readings, scratch);
}

describe('delivery only when idle (A2)', () => {
  test('an Assistant that answered its first message takes the undelivered incidents as chat 2; a busy one takes none', () => {
    const { board } = assistantBoard();
    const { incident } = board.openIncident(BLOCKED, FIXTURE_AT);

    deliverWhenIdle(board, [readingOf(0)]);
    expect(board.incidentById(incident?.id ?? '')?.deliveredInTurn).toBeNull();

    deliverWhenIdle(board, [readingOf(1)]);
    expect(board.incidentById(incident?.id ?? '')?.deliveredInTurn).toEqual({ jobId: ASSISTANT_ID, chatSequence: 2 });
  });

  test('the second result after the first message closes chat 2, and only then', () => {
    const { board } = assistantBoard();
    const { incident } = board.openIncident(BLOCKED, FIXTURE_AT);
    board.markIncidentDelivered(incident?.id ?? '', { jobId: ASSISTANT_ID, chatSequence: 2 });

    expect(AssistantSession.turnObservationsOf(board, [readingOf(1)]).closedDeliveryTurns).toEqual([]);
    expect(AssistantSession.turnObservationsOf(board, [readingOf(2)]).closedDeliveryTurns).toEqual([{ jobId: ASSISTANT_ID, chatSequence: 2 }]);
  });
});

describe('defaults on a turn end (A3)', () => {
  test('a move applied earlier in the hold that reads the result handles its incident; only the other one defaults', () => {
    const { board, records } = assistantBoard();
    const handled = board.openIncident(BLOCKED, FIXTURE_AT).incident;
    const left    = board.openIncident({ ...BLOCKED, ticketIds: ['002'] }, FIXTURE_AT).incident;
    for (const incident of [handled, left]) board.markIncidentDelivered(incident?.id ?? '', { jobId: ASSISTANT_ID, chatSequence: 2 });

    board.handleIncident(handled?.id ?? '', 'ticket-park', FIXTURE_AT);
    advance(board, [readingOf(2)]);

    expect(board.incidents()).toEqual([]);
    const incidentRecords = records.flatMap((record) => ('incidentId' in record ? [`${record.kind} ${record.incidentId}`] : []));
    expect(incidentRecords).toEqual([
      `incident-opened ${handled?.id}`, `incident-opened ${left?.id}`, `incident-handled ${handled?.id}`, `incident-defaulted ${left?.id}`,
    ]);
  });
});

describe('bounded turns and a fresh one past the token count (A4)', () => {
  test('the open turn at its call budget defaults its incidents, cause turn-budget', () => {
    const { board, records } = assistantBoard();
    const { incident } = board.openIncident(BLOCKED, FIXTURE_AT);
    board.markIncidentDelivered(incident?.id ?? '', { jobId: ASSISTANT_ID, chatSequence: 2 });

    advance(board, [readingOf(1, { callsSinceLastResult: ASSISTANT_TURN_CALL_BUDGET - 1 })]);
    expect(board.incidents()).toHaveLength(1);

    advance(board, [readingOf(1, { callsSinceLastResult: ASSISTANT_TURN_CALL_BUDGET })]);
    expect(records.find((record) => record.kind === 'incident-defaulted')).toMatchObject({ fields: { cause: 'turn-budget' } });
  });

  test('an idle Assistant past the context-token count has its input closed and is delivered nothing', () => {
    const { board } = assistantBoard();
    board.openIncident(BLOCKED, FIXTURE_AT);

    deliverWhenIdle(board, [readingOf(1, { lastContextTokens: ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH })]);

    expect(board.jobById(ASSISTANT_ID)?.state).toBe('stopping');
    expect(board.incidents()[0]?.deliveredInTurn).toBeNull();
  });
});

describe('the board\'s switch turned off (decision 24)', () => {
  test('a busy Assistant asked to wind down keeps its turn and its incident; idle, its input closes, and the incident it left defaults assistant-off', () => {
    const { board, records } = assistantBoard();
    const { incident: delivered } = board.openIncident(BLOCKED, FIXTURE_AT);
    board.markIncidentDelivered(delivered?.id ?? '', { jobId: ASSISTANT_ID, chatSequence: 2 });
    board.setAssistant(false, FIXTURE_AT);
    board.requestJobStop(ASSISTANT_ID, 'wind-down', FIXTURE_AT);
    const { incident: undelivered } = board.openIncident({ ...BLOCKED, ticketIds: ['002'] }, FIXTURE_AT);

    advance(board, [readingOf(1)]);
    deliverWhenIdle(board, [readingOf(1)]);

    expect(board.jobById(ASSISTANT_ID)?.state).toBe('running');
    expect(board.incidents().map((open) => open.id)).toEqual([delivered?.id ?? '']);
    expect(records.filter((record) => record.kind === 'incident-defaulted')).toMatchObject([{ incidentId: undelivered?.id, fields: { cause: 'assistant-off' } }]);

    advance(board, [readingOf(2)]);
    deliverWhenIdle(board, [readingOf(2)]);

    expect(board.jobById(ASSISTANT_ID)?.state).toBe('stopping');
    expect(board.incidents()).toEqual([]);
    expect(records.filter((record) => record.kind === 'incident-defaulted')).toMatchObject([
      { incidentId: undelivered?.id, fields: { cause: 'assistant-off' } }, { incidentId: delivered?.id, fields: { cause: 'assistant-off' } },
    ]);
  });

  test('with the switch off and no Assistant live none boots, and an incident takes its default in the pass that follows its opening', () => {
    const { board, records } = assistantBoard([], []);
    board.setAssistant(false, FIXTURE_AT);
    board.openIncident(BLOCKED, FIXTURE_AT);

    advance(board, []);

    expect(board.jobs()).toEqual([]);
    expect(records.find((record) => record.kind === 'incident-defaulted')).toMatchObject({ fields: { cause: 'assistant-off' } });
  });

  test('with the switch on and no Assistant live one boots', () => {
    const { board } = assistantBoard([], []);

    advance(board, []);

    expect(board.jobs().map((job) => job.kind)).toEqual(['assistant']);
  });
});

describe('a wind-down once asked completes', () => {
  test('the switch on again leaves the wind-down standing: no incident goes to that Assistant, its input closes once idle, and a fresh one boots when it has ended', () => {
    const { board, records } = assistantBoard();
    board.setAssistant(false, FIXTURE_AT);
    board.windDownAssistants(FIXTURE_AT);
    board.setAssistant(true, FIXTURE_AT);
    board.openIncident(BLOCKED, FIXTURE_AT);

    AssistantSession.windDownWhileOff(board, FIXTURE_AT);
    advance(board, [readingOf(0)]);
    deliverWhenIdle(board, [readingOf(0)]);
    expect(board.jobs().map((job) => [job.id, job.state, job.stopRequest])).toEqual([[ASSISTANT_ID, 'running', 'wind-down']]);

    advance(board, [readingOf(1)]);
    deliverWhenIdle(board, [readingOf(1)]);
    expect(board.jobs().map((job) => [job.id, job.state])).toEqual([[ASSISTANT_ID, 'stopping']]);
    expect(board.incidents().map((open) => open.deliveredInTurn)).toEqual([null]);

    board.endJob(ASSISTANT_ID, { outcome: 'closed' }, FIXTURE_AT);
    advance(board, []);
    expect(board.jobs().map((job) => [job.kind, job.state, job.stopRequest])).toEqual([['assistant', 'launching', undefined]]);
    expect(records.filter((record) => record.kind === 'incident-defaulted')).toEqual([]);
  });

  test('the assistant key gone from the pipeline with no wind-down asked: the pass asks the live Assistant, once', () => {
    const { board, records } = assistantBoard();
    board.setAssistant(false, FIXTURE_AT);

    AssistantSession.windDownWhileOff(board, FIXTURE_AT);
    AssistantSession.windDownWhileOff(board, FIXTURE_AT);

    expect(board.jobById(ASSISTANT_ID)?.stopRequest).toBe('wind-down');
    expect(records.filter((record) => record.kind === 'job-stop-requested')).toMatchObject([{ jobId: ASSISTANT_ID, fields: { mode: 'wind-down' } }]);
  });

  test('with the switch on the pass asks no Assistant to wind down', () => {
    const { board, records } = assistantBoard();

    AssistantSession.windDownWhileOff(board, FIXTURE_AT);

    expect(board.jobById(ASSISTANT_ID)?.stopRequest).toBeUndefined();
    expect(records.filter((record) => record.kind === 'job-stop-requested')).toEqual([]);
  });

  const closedWhenInterrupted = 'one winding down that is interrupted %s has no turn left to finish: it ends closed, no failed boot, and never waits for User';

  test.each(['agent-crashed', 'network-outage', 'lease-ended'] as const)(closedWhenInterrupted, (cause) => {
    const { board, records } = assistantBoard();
    board.setAssistant(false, FIXTURE_AT);
    board.windDownAssistants(FIXTURE_AT);
    board.interruptJob(ASSISTANT_ID, cause, FIXTURE_AT);

    const down = AssistantSession.endDownAssistants(board, [readingOf(0)], [], FIXTURE_AT);

    expect(down.bootFailed).toBe(false);
    expect(down.endedJobs.map((job) => job.id)).toEqual([ASSISTANT_ID]);
    expect(records.find((record) => record.kind === 'job-ended')).toMatchObject({ jobId: ASSISTANT_ID, fields: { outcome: 'closed' } });
    expect(board.jobs()).toEqual([]);
  });

  test('one winding down whose turn stays quiet ends closed, no failed boot, and its delivered incident defaults assistant-off', () => {
    const { board, records } = assistantBoard();
    const { incident } = board.openIncident(BLOCKED, FIXTURE_AT);
    board.markIncidentDelivered(incident?.id ?? '', { jobId: ASSISTANT_ID, chatSequence: 1 });
    board.setAssistant(false, FIXTURE_AT);
    board.windDownAssistants(FIXTURE_AT);

    const down = AssistantSession.endDownAssistants(board, [readingOf(0)], [ASSISTANT_ID], FIXTURE_AT);
    advance(board, []);

    expect(down.bootFailed).toBe(false);
    expect(records.find((record) => record.kind === 'job-ended')).toMatchObject({ jobId: ASSISTANT_ID, fields: { outcome: 'closed' } });
    expect(records.filter((record) => record.kind === 'incident-defaulted')).toMatchObject([{ incidentId: incident?.id, fields: { cause: 'assistant-off' } }]);
    expect(board.jobs()).toEqual([]);
  });
});

describe('down means fresh (A5)', () => {
  test('an interrupted Assistant that answered ends replaced, cause assistant-down, its delivered incident waits for the fresh one', () => {
    const { board, records } = assistantBoard();
    const { incident } = board.openIncident(BLOCKED, FIXTURE_AT);
    board.markIncidentDelivered(incident?.id ?? '', { jobId: ASSISTANT_ID, chatSequence: 2 });
    board.interruptJob(ASSISTANT_ID, 'agent-crashed', FIXTURE_AT);

    const down = AssistantSession.endDownAssistants(board, [readingOf(1)], [], FIXTURE_AT);
    advance(board, []);

    expect(down.bootFailed).toBe(false);
    expect(records.find((record) => record.kind === 'job-ended')).toMatchObject({ jobId: ASSISTANT_ID, fields: { outcome: 'replaced', cause: 'assistant-down' } });
    expect(records.filter((record) => record.kind === 'job-resumed')).toEqual([]);
    expect(board.jobs().map((job) => [job.kind, job.state])).toEqual([['assistant', 'launching']]);
    expect(board.incidents().map((open) => open.deliveredInTurn)).toEqual([null]);
  });

  test.each(['network-outage', 'lease-ended'] as const)('one interrupted %s is not down: it waits for User\'s resume, never replaced', (cause) => {
    const { board, records } = assistantBoard();
    board.interruptJob(ASSISTANT_ID, cause, FIXTURE_AT);

    const down = AssistantSession.endDownAssistants(board, [readingOf(1)], [], FIXTURE_AT);
    advance(board, []);

    expect(down).toEqual({ bootFailed: false, endedJobs: [] });
    expect(records.filter((record) => record.kind === 'job-ended' || record.kind === 'job-resumed')).toEqual([]);
    expect(board.jobs().map((job) => [job.id, job.state, job.interruption])).toEqual([[ASSISTANT_ID, 'interrupted', cause]]);
  });

  test('one quiet mid-turn is down too; one that never answered ends failed, a failed boot', () => {
    const { board, records } = assistantBoard();

    const down = AssistantSession.endDownAssistants(board, [readingOf(0)], [ASSISTANT_ID], FIXTURE_AT);

    expect(down.bootFailed).toBe(true);
    expect(records.find((record) => record.kind === 'job-ended')).toMatchObject({ fields: { outcome: 'failed', cause: 'assistant-down' } });
  });

  test('past two failed boots no boot comes but on a sweep, every incident defaults, and a fresh session\'s first result ends that', () => {
    const failedBoots = ['J1', 'J2'].flatMap(failedBootRecords);
    const { board: stored, records } = assistantBoard(failedBoots, []);
    stored.openIncident(BLOCKED, FIXTURE_AT);

    advance(stored, []);
    expect(stored.jobs()).toEqual([]);
    expect(records.find((record) => record.kind === 'incident-defaulted')).toMatchObject({ fields: { cause: 'no-assistant' } });

    advance(stored, [], { assistantBootRetryDue: true });
    expect(stored.jobs().map((job) => job.kind)).toEqual(['assistant']);

    stored.openIncident(BLOCKED, FIXTURE_AT);
    advance(stored, [], { assistantHasAnswered: true });
    expect(stored.incidents()).toHaveLength(1);
  });
});

describe('User\'s message waits for an idle point (A7)', () => {
  test('a job message to a busy Assistant is no chat yet; once idle it is the next numbered chat', () => {
    const { board } = assistantBoard();
    board.messageJob(ASSISTANT_ID, 'Example question for the Assistant', [], FIXTURE_AT);
    const assistant = board.jobById(ASSISTANT_ID) ?? LIVE_ASSISTANT;

    expect(AssistantSession.chatsToWriteOf(board, assistant, readingOf(0), [])).toEqual([]);
    expect(AssistantSession.chatsToWriteOf(board, assistant, readingOf(1), [])).toEqual([{ sequence: 2, incidentIds: [], messageNumber: 1 }]);
    expect(AssistantSession.chatsToWriteOf(board, assistant, readingOf(1), [{ sequence: 2, incidentIds: [], messageNumber: 1 }]))
      .toEqual([{ sequence: 2, incidentIds: [], messageNumber: 1 }]);
  });

  // A client shows this rule as the Assistant's turn, so a message it says goes out now must be the next chat written.
  test('the idle rule a reader shows agrees with the queue: idle exactly when User\'s message would be the next chat', () => {
    const { board } = assistantBoard();
    board.messageJob(ASSISTANT_ID, 'Example question for the Assistant', [], FIXTURE_AT);
    const assistant = board.jobById(ASSISTANT_ID) ?? LIVE_ASSISTANT;
    for (const reading of [readingOf(0), readingOf(1), readingOf(1, { instance: 2 })]) {
      const messageGoesOut = AssistantSession.chatsToWriteOf(board, assistant, reading, []).length > 0;
      expect(AssistantSession.assistantIsIdle(scratch, board, assistant, reading)).toBe(messageGoesOut);
    }
    const { incident } = board.openIncident(BLOCKED, FIXTURE_AT);
    board.markIncidentDelivered(incident?.id ?? '', { jobId: ASSISTANT_ID, chatSequence: 2 });
    expect(AssistantSession.assistantIsIdle(scratch, board, assistant, readingOf(1))).toBe(false);
    expect(AssistantSession.assistantIsIdle(scratch, board, assistant, readingOf(2))).toBe(true);
  });
});

describe('a chats file that cannot be read', () => {
  const OLD_BARE_LIST = '[{"sequence":2,"incidentIds":[],"messageNumber":1}]\n';

  function unreadableChatsFixture(): { board: Board; records: LogRecord[]; trackerDirectory: string; chatsFilePath: string } {
    const trackerDirectory = createScratchDirectory('assistant-session-unreadable-chats');
    const jobFolder = jobFolderIn(trackerDirectory, ASSISTANT_ID);
    mkdirSync(jobFolder, { recursive: true });
    const chatsFilePath = join(jobFolder, 'assistant-chats.json');
    writeFileSync(chatsFilePath, OLD_BARE_LIST);
    const { board, records } = assistantBoard();
    return {
      board, records, trackerDirectory, chatsFilePath
    };
  }

  test('opens its incident on the Assistant in the hold and retires it: it takes no incident, its input closes, and the next pass opens no second one', () => {
    const { board, trackerDirectory } = unreadableChatsFixture();
    board.openIncident(BLOCKED, FIXTURE_AT);
    const readings = [readingOf(0)];

    for (let pass = 0; pass < 2; pass += 1) {
      AssistantSession.closeInputWhenIdle(board, readings, trackerDirectory, FIXTURE_AT);
      AssistantSession.deliverIncidentsWhenIdle(board, readings, trackerDirectory);
    }

    expect(board.incidents().map((incident) => [incident.kind, incident.jobId, incident.facts, incident.deliveredInTurn])).toEqual([
      ['blocked', null, {}, null],
      ['system-file-unreadable', ASSISTANT_ID, { file: `jobs/${ASSISTANT_ID}/assistant-chats.json`, reason: 'it is not a JSON object' }, null],
    ]);
    const assistant = board.jobById(ASSISTANT_ID) ?? LIVE_ASSISTANT;
    expect(assistant.state).toBe('stopping');
    expect(AssistantSession.assistantIsIdle(trackerDirectory, board, assistant, readingOf(1))).toBe(false);
    expect(AssistantSession.midTurnJobIdsOf(trackerDirectory, board, [readingOf(0)])).toEqual([]);
    removeScratchDirectory(trackerDirectory);
  });

  test('a retired Assistant that has ended is followed by a fresh one, which takes the open incidents', () => {
    const { board, trackerDirectory } = unreadableChatsFixture();
    board.openIncident(BLOCKED, FIXTURE_AT);
    AssistantSession.closeInputWhenIdle(board, [readingOf(0)], trackerDirectory, FIXTURE_AT);

    board.endJob(ASSISTANT_ID, { outcome: 'closed' }, FIXTURE_AT);
    advance(board, []);

    const [freshAssistant] = board.jobs();
    expect([freshAssistant?.kind, freshAssistant?.id === ASSISTANT_ID]).toEqual(['assistant', false]);
    expect(board.incidents().map((incident) => incident.kind)).toEqual(['blocked', 'system-file-unreadable']);
    removeScratchDirectory(trackerDirectory);
  });

  test('an Assistant already stopping opens no incident', () => {
    const { board, trackerDirectory } = unreadableChatsFixture();
    board.moveJob(ASSISTANT_ID, 'stopping', FIXTURE_AT);

    AssistantSession.closeInputWhenIdle(board, [readingOf(0)], trackerDirectory, FIXTURE_AT);

    expect(board.incidents()).toEqual([]);
    removeScratchDirectory(trackerDirectory);
  });

  test('a winding-down Assistant with the switch off still ends: its input closes, and its defaulted incident is not opened again', () => {
    const { board, records, trackerDirectory } = unreadableChatsFixture();
    board.setAssistant(false, FIXTURE_AT);
    AssistantSession.windDownWhileOff(board, FIXTURE_AT);

    for (let pass = 0; pass < 2; pass += 1) {
      AssistantSession.closeInputWhenIdle(board, [readingOf(0)], trackerDirectory, FIXTURE_AT);
      advance(board, [readingOf(0)]);
    }

    expect(board.jobs().map((job) => [job.id, job.state, job.stopRequest])).toEqual([[ASSISTANT_ID, 'stopping', 'wind-down']]);
    expect(records.filter((record) => record.kind === 'incident-opened')).toHaveLength(1);
    expect(records.filter((record) => record.kind === 'incident-defaulted')).toMatchObject([{ fields: { cause: 'assistant-off' } }]);
    removeScratchDirectory(trackerDirectory);
  });

  test('after the hold the Assistant is sent nothing and the file is kept as it was', async () => {
    const { board, trackerDirectory, chatsFilePath } = unreadableChatsFixture();
    board.messageJob(ASSISTANT_ID, 'Example question for the Assistant', [], FIXTURE_AT);
    const sentLines: string[] = [];
    const boardChildren = {
      jobFolderOf:   (jobId: string) => jobFolderIn(trackerDirectory, jobId),
      sendInputOnce: (_marker: string, _folder: string, _instance: number, inputs: readonly { line?: string }[]) => {
        sentLines.push(...inputs.flatMap((input) => (input.line === undefined ? [] : [input.line])));
        return Promise.resolve(true);
      },
    } as unknown as BoardChildren;

    await AssistantSession.deliverChats({
      boardChildren,
      trackerDirectory,
      board,
      adapter:    { chatLineOf: (text) => text, interruptLineOf: () => 'interrupt' },
      readings:   [readingOf(1, { callsSinceLastResult: ASSISTANT_TURN_CALL_BUDGET })],
      chatTextOf: () => 'Example chat',
    });

    expect(sentLines).toEqual([]);
    expect(readFileSync(chatsFilePath, 'utf8')).toBe(OLD_BARE_LIST);
    expect(AssistantSession.unsentMessageCountOf(board, trackerDirectory, board.jobById(ASSISTANT_ID) ?? LIVE_ASSISTANT)).toBe(1);
    removeScratchDirectory(trackerDirectory);
  });
});

describe('the Hatch refuses the Assistant everything but its incident moves (A8)', () => {
  const blocked = {
    id: 'I4', kind: 'blocked' as const, ticketIds: ['011'], jobId: 'J2'
  };
  const assistant = {
    id: ASSISTANT_ID, role: 'assistant' as const, ticketIds: [], filedTickets: [], deliveredIncidents: [blocked], ticketIdsReadyForReviewOrCommitted: [], setupId: null
  };
  const refused: readonly [string, ControlCommand][] = [
    ['filing', {
      kind: 'ticket-add', title: 'Example finding', type: 'bug', priority: 'low', dependsOn: [], epics: [], network: [], introducedBy: null, foundInReview: null, bodyText: null
    } as ControlCommand],
    ['readying a ticket', { kind: 'ticket-ready', ticketReferences: ['11'] }],
    ['a priority', { kind: 'ticket-priority', ticketReference: '11', priority: 'high' }],
    ['a waiver, written into the Acceptance', {
      kind: 'ticket-edit', ticketReference: '11', bodyText: 'Waived: A1', appendsBody: true
    }],
    ['a setting', { kind: 'concurrency-set', limit: 2 }],
    ['a gate', { kind: 'pipeline-gate-add', gate: { name: 'verify', run: 'true' } }],
    ['pausing Hephaestus', { kind: 'hephaestus-pause' }],
    ['an answer to User\'s decision', { kind: 'decision-answer', decisionId: 'E1', answer: { form: 'letters', choices: ['A'] } }],
  ];

  test.each(refused)('%s is refused', (_what, command) => {
    expect(Bouncer.verdictOf(assistant, command).verdict).toBe('refused');
  });

  test('a fresh agent for its incident\'s job is admitted', () => {
    expect(Bouncer.verdictOf(assistant, { kind: 'job-fresh', jobId: 'J2', incidentId: 'I4' }).verdict).toBe('admitted');
  });
});

test('the scratch folder goes', () => {
  removeScratchDirectory(scratch);
});
