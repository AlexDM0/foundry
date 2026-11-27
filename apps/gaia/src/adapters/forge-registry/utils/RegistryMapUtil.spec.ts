/**
 * The registry entry mapper against its own contract: an entry without a whole project and root is left out, every optional key reads as
 * `null` when absent or broken and never leaves a forge out, keys are read as the entry's own, never through a prototype, and a presence
 * maps in each state the forge writes, an unknown state as none and a crash with a broken summary still as a crash.
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
    lastCommand:   'start',
    hephaestus:    {
      url:       'http://127.0.0.1:4987/',
      processId: 4242,
      startedAt: '2026-10-21T10:05:00+02:00',
      tokenPath: '/Users/alex.example/.forge-monitor/private/example/token',
    },
  };
}

function forgesOf(entry: unknown): readonly unknown[] {
  return RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: entry });
}

describe('registeredForgesOf', () => {
  test('maps a whole entry with its tracker id', () => {
    expect(RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: wholeEntry() })).toEqual([{
      trackerId:  TRACKER_ID,
      project:    'Example Agency',
      root:       '/Users/alex.example/development/example-agency',
      program:    '/Users/alex.example/development/forge/bin/forge',
      hephaestus: {
        url:       'http://127.0.0.1:4987/',
        processId: 4242,
        startedAt: '2026-10-21T10:05:00+02:00',
        tokenPath: '/Users/alex.example/.forge-monitor/private/example/token',
      },
      lastCommand:   'start',
      lastChangedAt: '2026-10-21T10:05:01+02:00',
      presence:      null,
    }]);
  });

  test('reads an absent or null program and token path as null', () => {
    for (const absentValue of [undefined, null]) {
      const entry    = { ...wholeEntry(), program: absentValue, hephaestus: { ...wholeEntry()['hephaestus'] as object, tokenPath: absentValue } };
      const [forge]  = RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: JSON.parse(JSON.stringify(entry)) as unknown });
      expect(forge?.program).toBeNull();
      expect(forge?.hephaestus?.tokenPath).toBeNull();
    }
  });

  test('reads a last command or change stamp that is absent, null or no text as null, and keeps the forge', () => {
    for (const unshownValue of [undefined, null, '', 42, ['start']]) {
      const entry   = JSON.parse(JSON.stringify({ ...wholeEntry(), lastCommand: unshownValue, lastChangedAt: unshownValue })) as unknown;
      const forges  = RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: entry });
      expect(forges).toHaveLength(1);
      expect(forges[0]).toMatchObject({ lastCommand: null, lastChangedAt: null });
    }
  });

  test('reads an absent or null hephaestus as a forge with no live Hephaestus', () => {
    for (const absentValue of [undefined, null]) {
      const entry = JSON.parse(JSON.stringify({ ...wholeEntry(), hephaestus: absentValue })) as unknown;
      expect(RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: entry })[0]?.hephaestus).toBeNull();
    }
  });

  test('keeps the registry order and leaves out only the entry whose project or root is malformed', () => {
    const forges = RegistryMapUtil.registeredForgesOf({
      third:     { ...wholeEntry(), project: 'Example Clinic' },
      first:     { ...wholeEntry(), project: 'Example Agency' },
      noProject: { ...wholeEntry(), project: 7 },
      second:    { ...wholeEntry(), project: 'Example Bookshop' },
      relative:  { ...wholeEntry(), root: 'development/example-agency' },
    });
    expect(forges.map((forge) => forge.trackerId)).toEqual(['third', 'first', 'second']);
  });

  test('leaves out an entry whose project or root is missing or empty', () => {
    for (const entry of [{}, { ...wholeEntry(), project: '' }, { ...wholeEntry(), root: '' }, { root: wholeEntry()['root'] }]) {
      expect(forgesOf(entry)).toEqual([]);
    }
  });

  test('reads an optional key that breaks its rule as null and keeps the forge', () => {
    const entry = { ...wholeEntry(), program: 42, hephaestus: { ...wholeEntry()['hephaestus'] as object, tokenPath: 'token' } };
    expect(forgesOf(entry)).toEqual([expect.objectContaining({ program: null, hephaestus: expect.objectContaining({ tokenPath: null }) as unknown })]);
  });

  test('reads a `hephaestus` entry that is not whole, or not an object, as no live Hephaestus and keeps the forge', () => {
    const hephaestus = wholeEntry()['hephaestus'] as Record<string, unknown>;
    const brokenHephaestusProcesses = [
      { ...hephaestus, url: 'file:///etc/passwd' },
      { ...hephaestus, processId: 0 },
      { ...hephaestus, startedAt: undefined },
      'http://127.0.0.1:4987/',
    ];
    for (const brokenHephaestus of brokenHephaestusProcesses) {
      const forges = forgesOf(JSON.parse(JSON.stringify({ ...wholeEntry(), hephaestus: brokenHephaestus })) as unknown);
      expect(forges).toEqual([expect.objectContaining({ trackerId: TRACKER_ID, hephaestus: null })]);
    }
  });

  test('leaves out an entry that is not an object', () => {
    for (const entry of [null, 'Example Agency', ['Example Agency']]) {
      expect(forgesOf(entry)).toEqual([]);
    }
  });

  test('leaves out an entry under an empty tracker id', () => {
    expect(RegistryMapUtil.registeredForgesOf({ '': wholeEntry() })).toEqual([]);
  });

  test('reads the keys of an entry as its own, never through its prototype', () => {
    const inheritedEntry = Object.create({ project: 'Example Inherited', root: '/Users/alex.example/development/example-inherited' }) as object;
    expect(forgesOf(inheritedEntry)).toEqual([]);
  });

  test('maps a tracker id that names a prototype key like any other', () => {
    const entries = JSON.parse(`{"__proto__": ${JSON.stringify(wholeEntry())}}`) as Record<string, unknown>;
    expect(RegistryMapUtil.registeredForgesOf(entries).map((forge) => forge.trackerId)).toEqual(['__proto__']);
  });
});

describe('the presence the forge last wrote', () => {
  function presenceOf(presence: unknown): unknown {
    return RegistryMapUtil.registeredForgesOf({ [TRACKER_ID]: { ...wholeEntry(), presence } })[0]?.presence;
  }

  test('maps serving, stopped and handed-over with their generation and stamp, and no crash', () => {
    for (const state of ['serving', 'stopped', 'handed-over'] as const) {
      expect(presenceOf({
        state, generation: 4, at: '2026-11-21T06:32:50+01:00', process: { processId: 4242 }
      }))
        .toEqual({
          state, generation: 4, at: '2026-11-21T06:32:50+01:00', crash: null
        });
    }
  });

  test('maps a crash with its component, whether it is suspected before a reboot, and its error', () => {
    const crash = {
      component: 'talos', suspected: true, errorName: 'Error', errorMessage: 'Example failure.', crashLogPath: '/Users/alex.example/crash-1.json',
    };
    expect(presenceOf({
      state: 'crashed', generation: null, at: '2026-11-21T06:32:52+01:00', crash
    })).toEqual({
      state:      'crashed',
      generation: null,
      at:         '2026-11-21T06:32:52+01:00',
      crash:      {
        component: 'talos', suspected: true, errorName: 'Error', errorMessage: 'Example failure.',
      },
    });
  });

  test('keeps a crash whose summary is not whole a crash with no summary', () => {
    expect(presenceOf({
      state: 'crashed', generation: 2, at: '2026-11-21T06:32:52+01:00', crash: { component: 'example-component', suspected: false }
    }))
      .toEqual({
        state: 'crashed', generation: 2, at: '2026-11-21T06:32:52+01:00', crash: null
      });
  });

  test('reads an absent presence, one that is no object, and a state Gaia does not know as no presence, and keeps the forge', () => {
    for (const presence of [undefined, null, 'serving', { state: 'resting', generation: 1 }]) {
      expect(presenceOf(JSON.parse(JSON.stringify({ presence })).presence as unknown)).toBeNull();
    }
  });
});
