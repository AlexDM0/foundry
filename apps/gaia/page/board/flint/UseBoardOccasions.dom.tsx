/**
 * `useBoardOccasions` against a recording Flint handle: the reading a component mounts with is no change, each new reading performs only the
 * first of its occasions, and an occasion while no Flint is made is not kept for a later one.
 */
import { cleanup, render }         from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import type { FlintHandle }                 from '../../lib/flint/FlintInterface.ts';
import type { BoardReading, OccasionBoard } from './BoardOccasionModel.ts';
import { useBoardOccasions }                from './UseBoardOccasions.ts';

afterEach(cleanup);

function recordingHandle(livesIn: string | null = null): { readonly handle: FlintHandle; readonly events: string[] } {
  const events: string[] = [];
  const handle: FlintHandle = {
    contractVersion: 3,
    registerHabitat: () => () => undefined,
    cue:             () => undefined,
    perform:         (intent) => {
      events.push(`perform ${intent}`);
      return 'performed';
    },
    steer:   () => 'steered',
    livesIn: () => livesIn,
    attend:  (attendant, count) => {
      events.push(`attend ${attendant} ${count}`);
      return 'attended';
    },
    startBrain: () => undefined,
    stopBrain:  () => undefined,
    destroy:    () => undefined,
  };
  return { handle, events };
}

function board(changes: { readonly paused?: boolean; readonly agentsInFlight?: number; readonly incidentIds?: readonly string[] } = {}): OccasionBoard {
  return {
    hephaestus:  { state: 'serving', paused: changes.paused ?? false, generation: 1 },
    usage:       { resetsAt: null, window: null },
    jobs:        [],
    incidents:   (changes.incidentIds ?? []).map((id) => ({ id })),
    concurrency: { agentsInFlight: changes.agentsInFlight ?? 1 },
  };
}

function Follower(properties: { readonly handle: FlintHandle | null; readonly reading: BoardReading | null }) {
  useBoardOccasions(properties.handle, properties.reading);
  return null;
}

test('the mounted reading performs nothing, and each new one performs only its first occasion, once', () => {
  const { handle, events } = recordingHandle();
  const first: BoardReading = { board: board(), connection: 'live', refusedCommandCount: 0 };
  const page = render(<Follower handle={handle} reading={first} />);
  const pausedWithIncident: BoardReading = { ...first, board: board({ paused: true, incidentIds: ['I1'] }) };
  page.rerender(<Follower handle={handle} reading={pausedWithIncident} />);
  page.rerender(<Follower handle={handle} reading={{ ...pausedWithIncident }} />);
  page.rerender(<Follower handle={handle} reading={{ ...pausedWithIncident, refusedCommandCount: 1 }} />);
  expect(events.filter((event) => event.startsWith('perform'))).toEqual(['perform hold', 'perform refuse']);
});

test('each board sets the watcher sparks to its agents in flight, also once Flint is made after it', () => {
  const { handle, events } = recordingHandle();
  const reading: BoardReading = { board: board({ agentsInFlight: 2 }), connection: 'live', refusedCommandCount: 0 };
  const page = render(<Follower handle={null} reading={reading} />);
  page.rerender(<Follower handle={handle} reading={reading} />);
  page.rerender(<Follower handle={handle} reading={{ ...reading, board: board({ agentsInFlight: 7 }) }} />);
  page.rerender(<Follower handle={handle} reading={{ ...reading, board: null }} />);
  expect(events).toEqual(['attend watcher-spark 2', 'attend watcher-spark 4', 'attend watcher-spark 0']);
});

test('an occasion while no Flint is made is not kept for the Flint made later', () => {
  const { handle, events } = recordingHandle();
  const live: BoardReading = { board: board(), connection: 'live', refusedCommandCount: 0 };
  const page = render(<Follower handle={null} reading={live} />);
  page.rerender(<Follower handle={null} reading={{ ...live, connection: 'down' }} />);
  page.rerender(<Follower handle={handle} reading={{ ...live, connection: 'down' }} />);
  expect(events.filter((event) => event.startsWith('perform'))).toEqual([]);
});

test('an incident that opens while Flint lives in the questions habitat is left to that habitat', () => {
  const { handle, events } = recordingHandle('questions');
  const first: BoardReading = { board: board(), connection: 'live', refusedCommandCount: 0 };
  const page = render(<Follower handle={handle} reading={first} />);
  page.rerender(<Follower handle={handle} reading={{ ...first, board: board({ incidentIds: ['I1'] }) }} />);
  expect(events.filter((event) => event.startsWith('perform'))).toEqual([]);
});

test('a stream that reopens and fails again, every few seconds, is unplugged once', () => {
  const { handle, events } = recordingHandle();
  const live: BoardReading = { board: board(), connection: 'live', refusedCommandCount: 0 };
  const page = render(<Follower handle={handle} reading={live} />);
  for (const connection of ['connecting', 'down', 'connecting', 'down', 'connecting', 'down'] as const) {
    page.rerender(<Follower handle={handle} reading={{ ...live, connection }} />);
  }
  expect(events.filter((event) => event.startsWith('perform'))).toEqual(['perform unplugged']);
});

test('without a reading, nothing is performed or attended', () => {
  const { handle, events } = recordingHandle();
  const page = render(<Follower handle={handle} reading={null} />);
  page.rerender(<Follower handle={handle} reading={null} />);
  expect(events).toEqual([]);
});
