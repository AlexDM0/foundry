/**
 * The page's command body read in. What matters: every kind this Gaia carries out maps to its internal command with exactly its keys, a
 * body at another `commandVersion` maps nothing, a key read only as the body's own, and a kind this Gaia does not carry out named so.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandDocument } from '../../../page/@types/CommandDocument.ts';

import { GaiaCommandIngestion } from './GaiaCommandIngestion.ts';

const TRACKER_ID = 'example-storefront-7c41';

function readingOf(body: unknown): ReturnType<GaiaCommandIngestion['read']> {
  return new GaiaCommandIngestion(JSON.stringify(body)).read();
}

describe('a body this Gaia carries out', () => {
  const SINGLE_FORGE_KINDS = ['forge-start', 'forge-pause', 'forge-resume', 'forge-restart', 'forge-update', 'forge-open-in-browser'] as const;

  for (const kind of SINGLE_FORGE_KINDS) {
    test(`maps ${kind} to its command with its tracker id`, () => {
      const document: CommandDocument = { commandVersion: 1, kind, trackerId: TRACKER_ID };
      expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind, trackerId: TRACKER_ID } });
    });
  }

  test('maps forge-stop with the choice of what happens to the agents', () => {
    const document: CommandDocument = {
      commandVersion: 1, kind: 'forge-stop', trackerId: TRACKER_ID, agents: 'stop-first',
    };
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'forge-stop', trackerId: TRACKER_ID, agents: 'stop-first' } });
  });

  test('maps fleet-look-again, which names no forge', () => {
    const document: CommandDocument = { commandVersion: 1, kind: 'fleet-look-again' };
    expect(readingOf(document)).toEqual({ verdict: 'readable', command: { kind: 'fleet-look-again' } });
  });

  test('leaves a key the kind does not name out of the command', () => {
    expect(readingOf({
      commandVersion: 1, kind: 'forge-pause', trackerId: TRACKER_ID, agents: 'keep',
    })).toEqual({ verdict: 'readable', command: { kind: 'forge-pause', trackerId: TRACKER_ID } });
  });
});

describe('a body that maps nothing', () => {
  test('answers not-json for a body that is no JSON', () => {
    expect(new GaiaCommandIngestion('{"commandVersion": 1,').read()).toEqual({ verdict: 'not-json' });
  });

  test('answers not-a-json-object for a JSON array', () => {
    expect(readingOf([{ commandVersion: 1, kind: 'fleet-look-again' }])).toEqual({ verdict: 'not-a-json-object' });
  });

  test('answers other-version for a body of a newer page, naming its version', () => {
    expect(readingOf({ commandVersion: 2, kind: 'fleet-look-again' })).toEqual({ verdict: 'other-version', commandVersion: 2 });
  });

  test('answers other-version for a body with no commandVersion', () => {
    expect(readingOf({ kind: 'fleet-look-again' })).toEqual({ verdict: 'other-version', commandVersion: null });
  });

  test('reads commandVersion only as the body\'s own key, never through its prototype', () => {
    expect(new GaiaCommandIngestion('{"__proto__": {"commandVersion": 1}, "kind": "fleet-look-again"}').read())
      .toEqual({ verdict: 'other-version', commandVersion: null });
  });

  test('answers unknown-kind for a kind this Gaia does not carry out', () => {
    expect(readingOf({ commandVersion: 1, kind: 'forge-explode', trackerId: TRACKER_ID })).toEqual({ verdict: 'unknown-kind', kind: 'forge-explode' });
  });

  test('answers unknown-kind with no kind for a body that names none', () => {
    expect(readingOf({ commandVersion: 1, trackerId: TRACKER_ID })).toEqual({ verdict: 'unknown-kind', kind: null });
  });

  test('names a missing or empty tracker id as malformed', () => {
    expect(readingOf({ commandVersion: 1, kind: 'forge-start' })).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId'] });
    expect(readingOf({ commandVersion: 1, kind: 'forge-start', trackerId: '' })).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId'] });
  });

  test('names every invalid key of a stop', () => {
    expect(readingOf({ commandVersion: 1, kind: 'forge-stop', agents: 'all' })).toEqual({ verdict: 'malformed', invalidKeys: ['trackerId', 'agents'] });
    expect(readingOf({ commandVersion: 1, kind: 'forge-stop', trackerId: TRACKER_ID })).toEqual({ verdict: 'malformed', invalidKeys: ['agents'] });
  });
});
