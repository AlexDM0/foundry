/**
 * Hephaestus's event broker. What matters: the first state sends only `board`; a later one sends one `job`, `decision` or `incident`
 * event per changed item, a `job` per newly ended job, `hephaestus` and `usage` when theirs changed, then `board`; a job first shown past
 * `launching`, one launched and ended within a pass included, is published `launching` first, so every state reaches the stream; a
 * state differing only in the page's generation stamp sends nothing; ids are `<generation>-<n>`, and a replay serves only a buffered id
 * of this generation. A changed gate profile run sends `profile`, and a changed pipeline, setup record or flow sends `pipeline` directly
 * before `board`, so the flow animates its marks from that slice (`docs/reference/hephaestus-api.md`, "The event stream").
 */
import { describe, expect, test } from 'bun:test';

import type { BoardState }      from './BoardState.ts';
import { EventBroker }          from './EventBroker.ts';
import type { HephaestusEvent } from './EventBroker.ts';

type ExampleChanges = Partial<Record<'jobs' | 'endedJobs' | 'decisions' | 'incidents' | 'profileRuns', unknown[]>> & {
  paused?:        boolean;
  resetsAt?:      string;
  stamp?:         number;
  draftRevision?: number;
};

function exampleState(changes: ExampleChanges = {}): BoardState {
  return {
    page:       { payload: { generatedAtEpochMilliseconds: changes.stamp ?? 1 }, tickets: [] },
    jobs:       changes.jobs ?? [{ id: 'J1', state: 'running' }],
    endedJobs:  changes.endedJobs ?? [],
    decisions:  changes.decisions ?? [],
    incidents:  changes.incidents ?? [],
    notices:    [],
    mergeQueue: { queuedTicketIds: [], slots: [] },
    hephaestus: {
      state: 'serving', paused: changes.paused ?? false, url: null, generation: 3, codeVersion: 'code-example', installVersion: 17, restartWarning: null
    },
    usage:         { resetsAt: changes.resetsAt ?? null, window: null },
    pipeline:      { readingVerdict: 'absent' },
    pipelineSetup: changes.draftRevision === undefined ? null : { record: { setupId: 'S1', draftRevision: changes.draftRevision } },
    pipelineFlow:  null,
    profileRuns:   changes.profileRuns ?? [],
  } as unknown as BoardState;
}

function recordingBroker() {
  const broker = EventBroker.createEventBroker(3);
  const events: HephaestusEvent[] = [];
  broker.subscribe((event) => events.push(event));
  return { broker, events };
}

describe('EventBroker', () => {
  test('the first state sends only board; a changed job, decision, incident, hephaestus and usage each send their event before board', () => {
    const { broker, events } = recordingBroker();
    broker.publishState(exampleState());
    expect(events.map((event) => `${event.id} ${event.kind}`)).toEqual(['3-1 board']);
    broker.publishState(exampleState({
      jobs:      [{ id: 'J1', state: 'ended' }, { id: 'J2', state: 'running' }],
      decisions: [{ id: 'D1' }],
      incidents: [{ id: 'I1' }],
      paused:    true,
      resetsAt:  '2026-10-29T18:00:00Z',
    }));
    expect(events.slice(1).map((event) => event.kind)).toEqual(['job', 'job', 'job', 'decision', 'incident', 'hephaestus', 'usage', 'board']);
    expect(events.slice(1, 4).map((event) => event.data)).toEqual([
      { id: 'J1', state: 'ended' }, { id: 'J2', state: 'launching' }, { id: 'J2', state: 'running' },
    ]);
  });

  test('a job launched and ended within one pass sends a job event for each state it passed through, in order, and only once', () => {
    const { broker, events } = recordingBroker();
    broker.publishState(exampleState());
    const merged = {
      id: 'J5', kind: 'merge', role: null, ticketIds: ['7'], target: 'main', attempt: 1, state: 'ended', outcome: 'landed', cause: null, endedAt: 'stamp',
    };
    broker.publishState(exampleState({ endedJobs: [merged] }));
    broker.publishState(exampleState({ endedJobs: [merged], paused: true }));
    const jobEvents = events.filter((event) => event.kind === 'job');
    expect(jobEvents.map((event) => (event.data as { state: string }).state)).toEqual(['launching', 'ended']);
    expect(jobEvents[0]?.data).toMatchObject({
      id: 'J5', kind: 'merge', ticketIds: ['7'], target: 'main', attempt: 1, live: { jobId: 'J5', calls: 0 },
    });
    expect(jobEvents[1]?.data).toEqual(merged);
  });

  test('a job ending again after a reopen, or first shown launching, is not published launching a second time', () => {
    const { broker, events } = recordingBroker();
    const firstEnding = { id: 'J5', state: 'ended', endedAt: 'first' };
    broker.publishState(exampleState({ endedJobs: [firstEnding] }));
    broker.publishState(exampleState({ endedJobs: [{ ...firstEnding, endedAt: 'second' }], jobs: [{ id: 'J1', state: 'running' }, { id: 'J6', state: 'launching' }] }));
    expect(events.filter((event) => event.kind === 'job').map((event) => event.data))
      .toEqual([{ id: 'J6', state: 'launching' }, { id: 'J5', state: 'ended', endedAt: 'second' }]);
  });

  test('a state differing only in the page generation stamp sends nothing', () => {
    const { broker, events } = recordingBroker();
    broker.publishState(exampleState({ stamp: 1 }));
    broker.publishState(exampleState({ stamp: 2 }));
    expect(events).toHaveLength(1);
  });

  test('a replay serves the events after a buffered id of this generation, and fresh for another generation or an unknown id', () => {
    const { broker } = recordingBroker();
    broker.publishState(exampleState());
    broker.publishState(exampleState({ jobs: [{ id: 'J1', state: 'ended' }] }));
    const replay = broker.replayAfter('3-1');
    expect(replay.verdict === 'replayed' ? replay.events.map((event) => event.id) : []).toEqual(['3-2', '3-3']);
    expect(broker.replayAfter('2-1')).toEqual({ verdict: 'fresh' });
    expect(broker.replayAfter('3-99')).toEqual({ verdict: 'fresh' });
    expect(broker.replayAfter(null)).toEqual({ verdict: 'fresh' });
    expect(broker.snapshot()?.id).toBe('3-3');
  });

  test('a changed setup or draft sends pipeline directly before board, and an unchanged one sends none', () => {
    const { broker, events } = recordingBroker();
    broker.publishState(exampleState({ draftRevision: 1 }));
    broker.publishState(exampleState({ draftRevision: 2, decisions: [{ id: 'D1' }] }));
    broker.publishState(exampleState({ draftRevision: 2, decisions: [{ id: 'D1' }], paused: true }));
    expect(events.slice(1).map((event) => event.kind)).toEqual(['decision', 'pipeline', 'board', 'hephaestus', 'board']);
    expect(events[2]?.data).toEqual({ pipeline: { readingVerdict: 'absent' }, pipelineSetup: { record: { setupId: 'S1', draftRevision: 2 } }, pipelineFlow: null });
  });

  test('a changed gate profile run sends profile with that run alone', () => {
    const { broker, events } = recordingBroker();
    const queued = {
      profileRunId: 'P1', gateName: 'test', phase: 'build', state: 'queued', elapsedMilliseconds: null
    };
    const other  = {
      profileRunId: 'P2', gateName: 'lint', phase: 'build', state: 'running', elapsedMilliseconds: null
    };
    broker.publishState(exampleState({ profileRuns: [queued, other] }));
    broker.publishState(exampleState({ profileRuns: [{ ...queued, state: 'running' }, other] }));
    expect(events.slice(1).map((event) => [event.kind, event.data])).toEqual([
      ['profile', { ...queued, state: 'running' }],
      ['board', expect.anything()],
    ]);
  });
});
