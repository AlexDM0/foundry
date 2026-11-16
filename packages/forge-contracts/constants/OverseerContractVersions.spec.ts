/**
 * The contract versions are the one table a producer and a reader of the Overseer's documents share, so every one must be a whole number
 * of at least 1. The check is planted with a table that breaks it, to prove it names the break.
 */
import { describe, expect, test } from 'bun:test';

import { OVERSEER_CONTRACT_VERSIONS } from './OverseerContractVersions.ts';

type VersionTable = Readonly<Record<string, number>>;

function inconsistenciesOf(versions: VersionTable): readonly string[] {
  return Object.entries(versions)
    .filter(([, version]) => !Number.isSafeInteger(version) || version < 1)
    .map(([name, version]) => `${name} has version ${version}`);
}

describe('the consistency check', () => {
  test('names a version that is no whole number of at least 1', () => {
    expect(inconsistenciesOf({ exampleMonitor: 0, exampleSummary: 1.5 })).toEqual(['exampleMonitor has version 0', 'exampleSummary has version 1.5']);
  });
});

describe('the Overseer contract versions', () => {
  test('are whole numbers of at least 1', () => {
    expect(inconsistenciesOf(OVERSEER_CONTRACT_VERSIONS)).toEqual([]);
  });

  test('keep control at 1, which clients built for forge 1.0 compare for equality', () => {
    expect(OVERSEER_CONTRACT_VERSIONS.control).toBe(1);
  });
});
