/**
 * The board occasions of Flint. What matters: each row of the table "Board occasions" gives its intent on the change it names and on no
 * other, so a board that stays as it was gives none; the first board after none is no change; a baton pass shows once, on the
 * passing-baton board or, when the page missed that board, on the rise of the generation, and the regroup follows on the rise after a
 * pass that was shown; an incident settles only on a record that closes it, never on an escalation or on leaving the list; a pipeline is
 * applied only when the revision of its newest Apply rises from one the board could read; the occasions come in the table's order, the
 * lost connection first, the refused command after the board and the connection that comes back last; an incident that opens or settles
 * while Flint lives in the questions habitat is that habitat's to answer, so the board does not; a stream that keeps reopening through
 * `connecting` is unplugged once and comes back once; and the count of `watcher-spark` is the agents in flight, at most 4, and 0 before a
 * board.
 */
import { describe, expect, test } from 'bun:test';

import type { SpriteIntent }                                         from '../../lib/flint/FlintInterface.ts';
import { BoardOccasionModel, type BoardReading, type OccasionBoard } from './BoardOccasionModel.ts';

type BoardChanges = Partial<Omit<OccasionBoard, 'hephaestus'>> & { readonly hephaestus?: Partial<OccasionBoard['hephaestus']> };

function board(changes: BoardChanges = {}): OccasionBoard {
  return {
    usage:       { resetsAt: null, window: null },
    jobs:        [{ id: 'J12' }],
    incidents:   [],
    concurrency: { agentsInFlight: 1 },
    ...changes,
    hephaestus:  {
      state: 'serving', paused: false, generation: 3, ...changes.hephaestus
    },
  };
}

function reading(changes: Partial<BoardReading> = {}): BoardReading {
  return {
    board: board(), connection: 'live', refusedCommandCount: 0, ...changes
  };
}

function readingOfBoard(changes: BoardChanges): BoardReading {
  return reading({ board: board(changes) });
}

const BOARD_WITHOUT_COUNT: OccasionBoard = {
  usage: null, jobs: [], incidents: [], hephaestus: { state: 'serving', paused: false },
};

const LIMIT_HIT = { resetsAt: '2026-10-29T20:00:00', window: 'five-hour' };

type QuestionHistory = NonNullable<OccasionBoard['questionHistory']>;

const INCIDENT_OPEN: QuestionHistory = [{ kind: 'incident-opened', incidentId: 'I1', fields: { kind: 'gate-red', ticketIds: [] } }];

function incidentClosedBy(kind: string): QuestionHistory {
  return [...INCIDENT_OPEN, { kind, incidentId: 'I1', fields: {} }];
}

const SETTLED_BY_DEFAULT = incidentClosedBy('incident-defaulted');

function appliedPipeline(appliedRevision: number): NonNullable<OccasionBoard['pipeline']> {
  return { applied: { readingVerdict: 'readable', application: { appliedRevision } } };
}

/** Flint at home: the kind of no habitat. */
const AT_HOME = null;

describe('each row of the table', () => {
  test.each<readonly [string, BoardReading, BoardReading, readonly SpriteIntent[]]>([
    ['the connection becomes down', reading(), reading({ connection: 'down' }), ['unplugged']],
    ['the Hephaestus state becomes down', reading(), reading({ board: board({ hephaestus: { state: 'down' } }) }), ['bank-fire']],
    ['the Hephaestus state becomes passing-baton', reading(), reading({ board: board({ hephaestus: { state: 'passing-baton' } }) }), ['baton-pass']],
    ['the generation rises after a pass that was shown, with jobs in flight',
      reading({ board: board({ hephaestus: { state: 'passing-baton' } }) }),
      reading({ board: board({ hephaestus: { generation: 4 } }) }),
      ['regroup']],
    ['usage gets a resetsAt', reading(), reading({ board: board({ usage: LIMIT_HIT }) }), ['out-of-fuel']],
    ['usage loses its resetsAt', reading({ board: board({ usage: LIMIT_HIT }) }), reading(), ['refuel']],
    ['paused becomes true', reading(), reading({ board: board({ hephaestus: { paused: true } }) }), ['hold']],
    ['an incident opens', reading({ board: board({ incidents: [{ id: 'I1' }] }) }), reading({ board: board({ incidents: [{ id: 'I1' }, { id: 'I2' }] }) }), ['intercept']],
    ['an incident settles', readingOfBoard({ questionHistory: INCIDENT_OPEN }), readingOfBoard({ questionHistory: incidentClosedBy('incident-handled') }), ['happy']],
    ['a pipeline is applied again', readingOfBoard({ pipeline: appliedPipeline(1) }), readingOfBoard({ pipeline: appliedPipeline(2) }), ['happy']],
    ['the first pipeline is applied', readingOfBoard({ pipeline: { applied: { readingVerdict: 'absent' } } }), readingOfBoard({ pipeline: appliedPipeline(1) }), ['happy']],
    ['Hephaestus refuses a control command', reading({ refusedCommandCount: 2 }), reading({ refusedCommandCount: 3 }), ['refuse']],
    ['the connection comes back', reading({ connection: 'down' }), reading(), ['wave']],
  ])('%s', (_change, previous, next, occasions) => {
    expect(BoardOccasionModel.occasionsOf(previous, next, AT_HOME)).toEqual(occasions);
  });

  test.each<readonly [string, BoardReading, BoardReading]>([
    ['a board that stays as it was', reading(), reading()],
    [
      'the first board after none',
      reading({ board: null }),
      reading({ board: board({ hephaestus: { state: 'down', paused: true }, usage: LIMIT_HIT, incidents: [{ id: 'I1' }] }) }),
    ],
    ['a connection that stays down', reading({ connection: 'down' }), reading({ connection: 'down' })],
    ['a Hephaestus that stays down', reading({ board: board({ hephaestus: { state: 'down' } }) }), reading({ board: board({ hephaestus: { state: 'down' } }) })],
    ['a pass that goes on', reading({ board: board({ hephaestus: { state: 'passing-baton' } }) }), reading({ board: board({ hephaestus: { state: 'passing-baton' } }) })],
    [
      'a generation the previous board did not serve',
      reading({ board: board({ hephaestus: { generation: null } }) }),
      reading({ board: board({ hephaestus: { generation: 4 } }) }),
    ],
    ['a generation that falls', reading({ board: board({ hephaestus: { generation: 4 } }) }), reading()],
    ['a usage limit that stays', reading({ board: board({ usage: LIMIT_HIT }) }), reading({ board: board({ usage: LIMIT_HIT }) })],
    ['a pause that ends', reading({ board: board({ hephaestus: { paused: true } }) }), reading()],
    ['an incident that leaves the list with no record that closes it', reading({ board: board({ incidents: [{ id: 'I1' }] }) }), reading()],
    ['an incident that escalates to a decision', readingOfBoard({ questionHistory: INCIDENT_OPEN }), readingOfBoard({ questionHistory: incidentClosedBy('incident-escalated') })],
    ['an incident that stays settled', readingOfBoard({ questionHistory: SETTLED_BY_DEFAULT }), readingOfBoard({ questionHistory: SETTLED_BY_DEFAULT })],
    ['a pipeline that stays applied', readingOfBoard({ pipeline: appliedPipeline(2) }), readingOfBoard({ pipeline: appliedPipeline(2) })],
    ['a pipeline that is readable again after a hand edit',
      readingOfBoard({ pipeline: { applied: { readingVerdict: 'malformed' } } }),
      readingOfBoard({ pipeline: appliedPipeline(2) })],
    ['a pipeline the previous board did not serve', reading(), readingOfBoard({ pipeline: appliedPipeline(2) })],
    ['a refusal count that stays', reading({ refusedCommandCount: 2 }), reading({ refusedCommandCount: 2 })],
  ])('%s gives none', (_change, previous, next) => {
    expect(BoardOccasionModel.occasionsOf(previous, next, AT_HOME)).toEqual([]);
  });
});

describe('the baton pass and the regroup', () => {
  test('a rise of the generation the page saw no pass for is the pass, then the regroup', () => {
    expect(BoardOccasionModel.occasionsOf(reading(), reading({ board: board({ hephaestus: { generation: 4 } }) }), AT_HOME)).toEqual(['baton-pass', 'regroup']);
  });

  test('a rise with no job in flight regroups nothing', () => {
    const passing = reading({ board: board({ hephaestus: { state: 'passing-baton' } }) });
    expect(BoardOccasionModel.occasionsOf(passing, reading({ board: board({ jobs: [], hephaestus: { generation: 4 } }) }), AT_HOME)).toEqual([]);
    expect(BoardOccasionModel.occasionsOf(reading(), reading({ board: board({ jobs: [], hephaestus: { generation: 4 } }) }), AT_HOME)).toEqual(['baton-pass']);
  });
});

describe('the order', () => {
  test('every occasion of one change comes in the table\'s order, so the connection is performed first and the refusal last', () => {
    const previous = reading({ board: board({ incidents: [] }) });
    const next = reading({
      connection:          'down',
      refusedCommandCount: 1,
      board:               board({ usage: LIMIT_HIT, incidents: [{ id: 'I2' }], hephaestus: { state: 'down', paused: true, generation: 4 } }),
    });
    expect(BoardOccasionModel.occasionsOf(previous, next, AT_HOME)).toEqual(['unplugged', 'bank-fire', 'baton-pass', 'regroup', 'out-of-fuel', 'hold', 'intercept', 'refuse']);
  });

  test('a settled incident comes before an applied pipeline, and the refusal before a connection that comes back', () => {
    const previous = readingOfBoard({ questionHistory: INCIDENT_OPEN, pipeline: appliedPipeline(1) });
    const settledAndApplied = board({ questionHistory: incidentClosedBy('incident-answered'), pipeline: appliedPipeline(2) });
    expect(BoardOccasionModel.occasionsOf(previous, reading({ board: settledAndApplied }), AT_HOME)).toEqual(['happy', 'happy']);
    expect(BoardOccasionModel.occasionsOf(reading({ connection: 'down' }), reading({ refusedCommandCount: 1 }), AT_HOME)).toEqual(['refuse', 'wave']);
  });

  test('a lost limit comes before the pause it shares a board with', () => {
    const next = reading({ board: board({ hephaestus: { paused: true } }) });
    expect(BoardOccasionModel.occasionsOf(reading({ board: board({ usage: LIMIT_HIT }) }), next, AT_HOME)).toEqual(['refuel', 'hold']);
  });
});

describe('one answer for one change', () => {
  test('an incident that opens while Flint lives in the questions habitat is that habitat\'s fuse, not the board\'s interception', () => {
    const previous = reading();
    const next = reading({ board: board({ incidents: [{ id: 'I2' }] }) });
    expect(BoardOccasionModel.occasionsOf(previous, next, 'questions')).toEqual([]);
    expect(BoardOccasionModel.occasionsOf(previous, next, 'tickets')).toEqual(['intercept']);
  });

  test('an incident that settles while Flint lives in the questions habitat is that habitat\'s answer, not the board\'s', () => {
    const previous = readingOfBoard({ questionHistory: INCIDENT_OPEN });
    const next = readingOfBoard({ questionHistory: incidentClosedBy('incident-handled') });
    expect(BoardOccasionModel.occasionsOf(previous, next, 'questions')).toEqual([]);
    expect(BoardOccasionModel.occasionsOf(previous, next, 'tickets')).toEqual(['happy']);
  });

  test('a stream that keeps reopening is unplugged once and comes back once: connecting keeps the last settled connection', () => {
    const states = ['live', 'connecting', 'down', 'connecting', 'down', 'connecting', 'live', 'down'] as const;
    let kept = reading({ connection: 'live' });
    const occasions: SpriteIntent[] = [];
    for (const connection of states.slice(1)) {
      const next = reading({ connection });
      occasions.push(...BoardOccasionModel.occasionsOf(kept, next, AT_HOME));
      kept = BoardOccasionModel.keptReadingOf(kept, next);
    }
    expect(occasions).toEqual(['unplugged', 'wave', 'unplugged']);
  });

  test('a settled reading is kept as it is, and connecting keeps the connection before it', () => {
    expect(BoardOccasionModel.keptReadingOf(reading({ connection: 'down' }), reading({ connection: 'connecting', refusedCommandCount: 4 })))
      .toEqual(reading({ connection: 'down', refusedCommandCount: 4 }));
    expect(BoardOccasionModel.keptReadingOf(reading(), reading({ connection: 'no-session' }))).toEqual(reading({ connection: 'no-session' }));
    expect(BoardOccasionModel.keptReadingOf(null, reading({ connection: 'connecting' }))).toEqual(reading({ connection: 'connecting' }));
  });
});

describe('the watcher sparks', () => {
  test.each<readonly [string, OccasionBoard | null, number]>([
    ['no board yet', null, 0],
    ['a board without the count', BOARD_WITHOUT_COUNT, 0],
    ['no agent in flight', board({ concurrency: { agentsInFlight: 0 } }), 0],
    ['three agents in flight', board({ concurrency: { agentsInFlight: 3 } }), 3],
    ['six agents in flight, held at four', board({ concurrency: { agentsInFlight: 6 } }), 4],
  ])('%s', (_case, sparkBoard, count) => {
    expect(BoardOccasionModel.watcherSparkCountOf(sparkBoard)).toBe(count);
  });
});
