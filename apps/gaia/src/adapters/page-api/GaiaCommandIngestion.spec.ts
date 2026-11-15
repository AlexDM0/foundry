/**
 * The page's command body read in. What matters: every kind this Gaia carries out maps to its internal command with exactly its keys, a
 * body at another `commandVersion`, older or newer, maps nothing, a `__proto__` key is an ordinary key that carries none of the keys inside
 * it, and a kind this Gaia does not carry out is named so. A limit is a whole number of at least one, a path the server runs a program in
 * is absolute, and a settings value has the type of its key.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandDocument, SettingsChange } from '../../../page/@types/CommandDocument.ts';
import { GAIA_SETTINGS_DEFAULTS }               from '../../shared/constants/GaiaSettingsDefaults.ts';

import { GaiaCommandIngestion } from './GaiaCommandIngestion.ts';

const TRACKER_ID = 'example-storefront-7c41';

function readingOf(body: unknown): ReturnType<GaiaCommandIngestion['read']> {
  return new GaiaCommandIngestion(JSON.stringify(body)).read();
}

describe('a body this Gaia carries out', () => {
  const SINGLE_FORGE_KINDS = [
    'forge-start',
    'forge-pause',
    'forge-resume',
    'forge-restart',
    'forge-update',
    'forge-open-in-browser',
    'forge-hide',
    'forge-unhide',
    'forge-brain-start',
    'forge-brain-stop',
  ] as const;

  for (const kind of SINGLE_FORGE_KINDS) {
    test(`maps ${kind} to its command with its tracker id`, () => {
      const document: CommandDocument = { commandVersion: 2, kind, trackerId: TRACKER_ID };
      expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind, trackerId: TRACKER_ID } });
    });
  }

  test('maps forge-stop with the choice of what happens to the agents', () => {
    const document: CommandDocument = {
      commandVersion: 2, kind: 'forge-stop', trackerId: TRACKER_ID, agents: 'stop-first',
    };
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'forge-stop', trackerId: TRACKER_ID, agents: 'stop-first' } });
  });

  test('maps fleet-look-again, which names no forge', () => {
    const document: CommandDocument = { commandVersion: 2, kind: 'fleet-look-again' };
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'fleet-look-again' } });
  });

  test('maps forge-concurrency-set with its limit', () => {
    const document: CommandDocument = {
      commandVersion: 2, kind: 'forge-concurrency-set', trackerId: TRACKER_ID, limit: 3,
    };
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'forge-concurrency-set', trackerId: TRACKER_ID, limit: 3 } });
  });

  test('maps machine-agent-limit-set, which names no forge', () => {
    const document: CommandDocument = { commandVersion: 2, kind: 'machine-agent-limit-set', limit: 6 };
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'machine-agent-limit-set', limit: 6 } });
  });

  test('maps forge-add with the repository root and the project name', () => {
    const root = '/Users/example/Development/example-storefront';
    const document: CommandDocument = {
      commandVersion: 2, kind: 'forge-add', root, project: 'Example Storefront',
    };
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'forge-add', root, project: 'Example Storefront' } });
  });

  test('maps path-choose for a folder and for a file', () => {
    for (const what of ['folder', 'file'] as const) {
      const document: CommandDocument = { commandVersion: 2, kind: 'path-choose', what };
      expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'path-choose', what } });
    }
  });

  test('maps settings-set of every settings key to the change of that one key', () => {
    const changes: SettingsChange[] = [
      { key: 'theme', value: 'dark' },
      { key: 'hiddenTrackerIds', value: [TRACKER_ID] },
      { key: 'forgeProgramPath', value: '/Users/example/.bun/bin/forge' },
      { key: 'forgeProgramPath', value: null },
      { key: 'notifications', value: { enabled: false, kinds: { ...GAIA_SETTINGS_DEFAULTS.notifications.kinds } } },
      { key: 'startForgesAtLogin', value: true },
    ];
    for (const change of changes) {
      const document: CommandDocument = { commandVersion: 2, kind: 'settings-set', ...change };
      expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'settings-set', change } });
    }
  });

  test('leaves a key the kind does not name out of the command', () => {
    expect(readingOf({
      commandVersion: 2, kind: 'forge-pause', trackerId: TRACKER_ID, agents: 'keep',
    })).toEqual({ verdict: 'readable', command: { kind: 'forge-pause', trackerId: TRACKER_ID } });
  });
});

describe('a body that maps nothing', () => {
  test('answers not-json for a body that is no JSON', () => {
    expect(new GaiaCommandIngestion('{"commandVersion": 2,').read()).toEqual({ verdict: 'not-json' });
  });

  test('answers not-a-json-object for a JSON array', () => {
    expect(readingOf([{ commandVersion: 2, kind: 'fleet-look-again' }])).toEqual({ verdict: 'not-a-json-object' });
  });

  test('answers other-version for a body of a newer page, naming its version', () => {
    expect(readingOf({ commandVersion: 3, kind: 'fleet-look-again' })).toEqual({ verdict: 'other-version', commandVersion: 3 });
  });

  test('answers other-version for a body of an older page, naming its version', () => {
    expect(readingOf({ commandVersion: 1, kind: 'fleet-look-again' })).toEqual({ verdict: 'other-version', commandVersion: 1 });
  });

  test('answers other-version for a body with no commandVersion', () => {
    expect(readingOf({ kind: 'fleet-look-again' })).toEqual({ verdict: 'other-version', commandVersion: null });
  });

  test('treats a __proto__ key in the body as an ordinary key that carries no commandVersion', () => {
    expect(new GaiaCommandIngestion('{"__proto__": {"commandVersion": 2}, "kind": "fleet-look-again"}').read())
      .toEqual({ verdict: 'other-version', commandVersion: null });
  });

  test('answers unknown-kind for a kind this Gaia does not carry out', () => {
    expect(readingOf({ commandVersion: 2, kind: 'forge-explode', trackerId: TRACKER_ID })).toEqual({ verdict: 'unknown-kind', kind: 'forge-explode' });
  });

  test('answers unknown-kind with no kind for a body that names none', () => {
    expect(readingOf({ commandVersion: 2, trackerId: TRACKER_ID })).toEqual({ verdict: 'unknown-kind', kind: null });
  });

  test('names a missing or empty tracker id as malformed', () => {
    expect(readingOf({ commandVersion: 2, kind: 'forge-start' })).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId'] });
    expect(readingOf({ commandVersion: 2, kind: 'forge-start', trackerId: '' })).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId'] });
  });

  test('names every invalid key of a stop', () => {
    expect(readingOf({ commandVersion: 2, kind: 'forge-stop', agents: 'all' })).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId', 'agents'] });
    expect(readingOf({ commandVersion: 2, kind: 'forge-stop', trackerId: TRACKER_ID })).toEqual({ verdict: 'malformed', invalidKeys: ['agents'] });
  });
});

describe('the keys of the limits, adding, settings and the chooser', () => {
  test('names a limit that is no whole number of at least one as malformed', () => {
    for (const limit of [0, -1, 2.5, '3', null]) {
      expect(readingOf({ commandVersion: 2, kind: 'machine-agent-limit-set', limit })).toEqual({ verdict: 'malformed', invalidKeys: ['limit'] });
    }
  });

  test('names every invalid key of a concurrency change', () => {
    expect(readingOf({ commandVersion: 2, kind: 'forge-concurrency-set' })).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId', 'limit'] });
    expect(readingOf({
      commandVersion: 2, kind: 'forge-concurrency-set', trackerId: TRACKER_ID, limit: 0,
    })).toEqual({ verdict: 'malformed', invalidKeys: ['limit'] });
  });

  test('names a root that is not absolute and an empty project name as malformed', () => {
    expect(readingOf({
      commandVersion: 2, kind: 'forge-add', root: 'example-storefront', project: '',
    })).toEqual({ verdict: 'malformed', invalidKeys: ['root', 'project'] });
  });

  test('names a settings key the settings do not have as malformed, and one carried only inside a __proto__ key as missing', () => {
    expect(readingOf({
      commandVersion: 2, kind: 'settings-set', key: 'version', value: 2,
    })).toEqual({ verdict: 'malformed', invalidKeys: ['key'] });
    expect(new GaiaCommandIngestion('{"commandVersion": 2, "kind": "settings-set", "__proto__": {"key": "theme"}, "value": "dark"}').read())
      .toEqual({ verdict: 'malformed', invalidKeys: ['key'] });
  });

  test('names a settings value of another type than its key holds as malformed', () => {
    const invalidChanges = [
      { key: 'theme', value: 'sepia' },
      { key: 'hiddenTrackerIds', value: [TRACKER_ID, 7] },
      { key: 'forgeProgramPath', value: 'bin/forge' },
      { key: 'notifications', value: { enabled: true, kinds: { questions: true } } },
      { key: 'startForgesAtLogin', value: 'yes' },
    ];
    for (const change of invalidChanges) {
      expect(readingOf({ commandVersion: 2, kind: 'settings-set', ...change })).toEqual({ verdict: 'malformed', invalidKeys: ['value'] });
    }
  });

  test('names a chooser target that is neither a folder nor a file as malformed', () => {
    expect(readingOf({ commandVersion: 2, kind: 'path-choose', what: 'application' })).toEqual({ verdict: 'malformed', invalidKeys: ['what'] });
  });
});
