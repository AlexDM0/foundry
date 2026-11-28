/**
 * A child record survives Talos and is read by Hephaestus after it, so the reader must give back exactly what was written and never
 * throw: a record round trips through its text, another format version is named rather than misread, and truncated or damaged text
 * reads `unreadable`.
 */
import { describe, expect, test } from 'bun:test';

import { type ChildRecord, childRecordOf, childRecordTextOf } from './ChildRecord.ts';

const RUNNING_AGENT: ChildRecord = {
  formatVersion:         1,
  childId:               'jobs/J1#1',
  kind:                  'agent',
  label:                 'J1 build',
  workingDirectory:      '/example/worktree',
  talosStartNumber:      3,
  talos:                 { processId: 4242, startStamp: '1790000000', bootIdentity: 'example-boot' },
  state:                 'running',
  childProcess:          { processId: 4243, startStamp: '1790000001', bootIdentity: 'example-boot' },
  childProcessGroupId:   4243,
  eventLogFormatVersion: 2,
  timeBoundMilliseconds: null,
  recognisedEndings:     [],
  end:                   null,
};

const ENDED_AGENT: ChildRecord = {
  ...RUNNING_AGENT,
  state:             'ended',
  recognisedEndings: [{ name: 'network-outage', closingLineSequence: 41, countedLines: 2 }],
  end:               {
    reason: 'exited', exitCode: 1, signal: null, detail: null, runMilliseconds: 181_600
  },
};

const LINE_NEVER_SPAWNED: ChildRecord = {
  ...RUNNING_AGENT,
  childId:               'jobs/J1/gate-1#1',
  kind:                  'line',
  state:                 'ended',
  talos:                 null,
  childProcess:          null,
  childProcessGroupId:   null,
  timeBoundMilliseconds: 900_000,
  end:                   {
    reason: 'spawn-failed', exitCode: null, signal: null, detail: 'ENOENT', runMilliseconds: 0
  },
};

describe('a record', () => {
  test.each([['a running agent', RUNNING_AGENT], ['an ended agent with an ending', ENDED_AGENT], ['a line that never ran', LINE_NEVER_SPAWNED]])(
    '%s round trips through its text',
    (_title, record) => {
      expect(childRecordOf(childRecordTextOf(record))).toEqual({ verdict: 'read', record });
    },
  );

  test('is written as two-space JSON with a final line feed', () => {
    expect(childRecordTextOf(RUNNING_AGENT)).toBe(`${JSON.stringify(RUNNING_AGENT, null, 2)}\n`);
  });

  test('drops keys it does not name', () => {
    expect(childRecordOf(JSON.stringify({ ...RUNNING_AGENT, later: true }))).toEqual({ verdict: 'read', record: RUNNING_AGENT });
  });
});

test('another format version reads other-format', () => {
  expect(childRecordOf(JSON.stringify({ ...RUNNING_AGENT, formatVersion: 2 }))).toEqual({ verdict: 'other-format', formatVersion: 2 });
});

describe('unreadable text', () => {
  test('truncated text reads unreadable', () => {
    const text = childRecordTextOf(ENDED_AGENT);
    expect(childRecordOf(text.slice(0, text.length / 2)).verdict).toBe('unreadable');
  });

  test.each<[string, Record<string, unknown>]>([
    ['no format version', { formatVersion: undefined }],
    ['an unknown state', { state: 'paused' }],
    ['an identity of the old shape', { talos: { processId: 4242, startEpochSeconds: 1790000000, bootIdentity: 'example-boot' } }],
    ['an event log of the retired format 1', { eventLogFormatVersion: 1 }],
    ['a time bound of 0', { timeBoundMilliseconds: 0 }],
    ['an unknown end reason', { end: { ...ENDED_AGENT.end, reason: 'crashed' } }],
    ['a recognised ending with no name', { recognisedEndings: [{ closingLineSequence: 1, countedLines: 0 }] }],
  ])('%s reads unreadable', (_title, change) => {
    expect(childRecordOf(JSON.stringify({ ...RUNNING_AGENT, ...change })).verdict).toBe('unreadable');
  });

  test('a list reads unreadable', () => {
    expect(childRecordOf('[]').verdict).toBe('unreadable');
  });
});
