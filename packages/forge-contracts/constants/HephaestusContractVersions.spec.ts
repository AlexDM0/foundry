/**
 * The contract versions are the one table a producer and a reader of Hephaestus's documents share, so every one must be a whole number
 * of at least 1. The check is planted with a table that breaks it, to prove it names the break.
 */
import { describe, expect, test } from 'bun:test';

import { HEPHAESTUS_CONTRACT_VERSIONS } from './HephaestusContractVersions.ts';

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

describe('the Hephaestus contract versions', () => {
  test('are whole numbers of at least 1', () => {
    expect(inconsistenciesOf(HEPHAESTUS_CONTRACT_VERSIONS)).toEqual([]);
  });

  test('are the versions forge 4.1 serves, with no embed contract', () => {
    expect(HEPHAESTUS_CONTRACT_VERSIONS).toEqual({
      identity: 1, summary: 3, monitor: 6, control: 3
    });
  });
});
