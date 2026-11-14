/**
 * The registry entry mapper against its own contract: the optional F4 and F9 keys read as `null` when absent, a key that is present must
 * hold to its rule, the last command and its stamp are only shown and so never leave a forge out, every problem of a left-out entry is
 * named, and keys are read as the entry's own, never through a prototype.
 */
import { describe, expect, test } from 'bun:test';

import { RegistryMapUtil } from './RegistryMapUtil.ts';

const TRACKER_ID = '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c0a37';

function wholeEntry(): Record<string, unknown> {
  return {
    project:       'Example Agency',
    root:          '/Users/alex.example/development/example-agency',
    program:       '/Users/alex.example/development/forge/bin/forge',
    lastChangedAt: '2026-10-21T10:05:01+02:00',
    lastCommand:   'oversee',
    overseer:      {
      url:       'http://127.0.0.1:4987/',
      processId: 4242,
      startedAt: '2026-10-21T10:05:00+02:00',
      tokenPath: '/Users/alex.example/.forge-monitor/watchers/example/token',
    },
  };
}

function problemsOf(entry: unknown): unknown {
  return RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: entry }).leftOutEntries[0]?.problems;
}

describe('registeredForgesOf', () => {
  test('maps a whole entry with its tracker id', () => {
    expect(RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: wholeEntry() })).toEqual({
      forges: [{
        trackerId: TRACKER_ID,
        project:   'Example Agency',
        root:      '/Users/alex.example/development/example-agency',
        program:   '/Users/alex.example/development/forge/bin/forge',
        overseer:  {
          url:       'http://127.0.0.1:4987/',
          processId: 4242,
          startedAt: '2026-10-21T10:05:00+02:00',
          tokenPath: '/Users/alex.example/.forge-monitor/watchers/example/token',
        },
        lastCommand:   'oversee',
        lastChangedAt: '2026-10-21T10:05:01+02:00',
      }],
      leftOutEntries: [],
    });
  });

  test('reads an absent or null program and token path as null', () => {
    for (const absentValue of [undefined, null]) {
      const entry    = { ...wholeEntry(), program: absentValue, overseer: { ...wholeEntry()['overseer'] as object, tokenPath: absentValue } };
      const [forge]  = RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: JSON.parse(JSON.stringify(entry)) as unknown }).forges;
      expect(forge?.program).toBeNull();
      expect(forge?.overseer?.tokenPath).toBeNull();
    }
  });

  test('reads a last command or change stamp that is absent, null or no text as null, and keeps the forge', () => {
    for (const unshownValue of [undefined, null, '', 42, ['oversee']]) {
      const entry   = JSON.parse(JSON.stringify({ ...wholeEntry(), lastCommand: unshownValue, lastChangedAt: unshownValue })) as unknown;
      const mapping = RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: entry });
      expect(mapping.leftOutEntries).toEqual([]);
      expect(mapping.forges[0]).toMatchObject({ lastCommand: null, lastChangedAt: null });
    }
  });

  test('reads an absent or null overseer as a forge with no live Overseer', () => {
    for (const absentValue of [undefined, null]) {
      const entry = JSON.parse(JSON.stringify({ ...wholeEntry(), overseer: absentValue })) as unknown;
      expect(RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: entry }).forges[0]?.overseer).toBeNull();
    }
  });

  test('keeps the registry order and leaves out only the malformed entry', () => {
    const mapping = RegistryMapUtil.registeredForgesOf({
      third:  { ...wholeEntry(), project: 'Example Clinic' },
      first:  { ...wholeEntry(), project: 'Example Agency' },
      broken: { ...wholeEntry(), project: 7 },
      second: { ...wholeEntry(), project: 'Example Bookshop' },
    });
    expect(mapping.forges.map((forge) => forge.trackerId)).toEqual(['third', 'first', 'second']);
    expect(mapping.leftOutEntries).toEqual([{ trackerId: 'broken', problems: [{ key: 'project', reason: 'not-a-string' }] }]);
  });

  test('names every problem of a left-out entry, not only the first', () => {
    const entry = {
      project:  '',
      root:     'development/example-agency',
      program:  42,
      overseer: { url: 'file:///etc/passwd', processId: 0, tokenPath: 'token' },
    };
    expect(problemsOf(entry)).toEqual([
      { key: 'project', reason: 'empty' },
      { key: 'root', reason: 'not-an-absolute-path' },
      { key: 'program', reason: 'not-a-string' },
      { key: 'overseer.url', reason: 'not-an-http-address' },
      { key: 'overseer.processId', reason: 'not-a-process-id' },
      { key: 'overseer.startedAt', reason: 'missing' },
      { key: 'overseer.tokenPath', reason: 'not-an-absolute-path' },
    ]);
  });

  test('leaves out an entry whose required keys are missing', () => {
    expect(problemsOf({})).toEqual([{ key: 'project', reason: 'missing' }, { key: 'root', reason: 'missing' }]);
  });

  test('leaves out an entry that is not an object, and one whose overseer is not an object', () => {
    for (const entry of [null, 'Example Agency', ['Example Agency']]) {
      expect(problemsOf(entry)).toEqual([{ key: 'entry', reason: 'not-an-object' }]);
    }
    expect(problemsOf({ ...wholeEntry(), overseer: 'http://127.0.0.1:4987/' })).toEqual([{ key: 'overseer', reason: 'not-an-object' }]);
  });

  test('leaves out an entry under an empty tracker id', () => {
    expect(RegistryMapUtil.registeredForgesOf({ '': wholeEntry() }).leftOutEntries).toEqual([
      { trackerId: '', problems: [{ key: 'trackerId', reason: 'empty' }] },
    ]);
  });

  test('reads the keys of an entry as its own, never through its prototype', () => {
    const inheritedEntry = Object.create({ project: 'Example Inherited', root: '/Users/alex.example/development/example-inherited' }) as object;
    expect(problemsOf(inheritedEntry)).toEqual([{ key: 'project', reason: 'missing' }, { key: 'root', reason: 'missing' }]);
  });

  test('maps a tracker id that names a prototype key like any other', () => {
    const entries = JSON.parse(`{"__proto__": ${JSON.stringify(wholeEntry())}}`) as Record<string, unknown>;
    expect(RegistryMapUtil.registeredForgesOf(entries).forges.map((forge) => forge.trackerId)).toEqual(['__proto__']);
  });
});

describe('jsonObjectOf', () => {
  test('answers an object and null for an array, null and every other value', () => {
    expect(RegistryMapUtil.jsonObjectOf({ version: 1 })).toEqual({ version: 1 });
    for (const value of [[], null, 'text', 1, true, undefined]) expect(RegistryMapUtil.jsonObjectOf(value)).toBeNull();
  });
});
