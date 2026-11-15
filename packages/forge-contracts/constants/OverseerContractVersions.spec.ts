/**
 * The contract versions are the one table a producer and a reader of the Overseer's documents share, so they must hold together: every
 * contract version is a whole number of at least 1, every older contract version lies below its contract's current one and is named once,
 * and Flint's brain needs a control version the table serves. Each check is planted with a table that breaks it, to prove it names the break.
 */
import { describe, expect, test } from 'bun:test';

import { FLINT_BRAIN_CONTRACT_VERSIONS, OLDER_OVERSEER_CONTRACT_VERSIONS, OVERSEER_CONTRACT_VERSIONS } from './OverseerContractVersions.ts';

type VersionTable = Readonly<Record<string, number>>;

type OlderVersionTable = Readonly<Record<string, readonly number[]>>;

function isWholeNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function inconsistenciesOf(versions: VersionTable, olderVersions: OlderVersionTable): readonly string[] {
  const inconsistencies: string[] = [];
  for (const [name, version] of Object.entries(versions)) {
    if (!isWholeNumber(version) || version < 1) inconsistencies.push(`${name} has version ${version}`);
  }
  for (const [contract, older] of Object.entries(olderVersions)) {
    const current = Object.hasOwn(versions, contract) ? versions[contract] : undefined;
    if (current === undefined) {
      inconsistencies.push(`${contract} has older versions but no version`);
      continue;
    }
    for (const [index, version] of older.entries()) {
      if (!isWholeNumber(version) || version < 1 || version >= current) inconsistencies.push(`${contract} names older version ${version}`);
      if (older.indexOf(version) !== index) inconsistencies.push(`${contract} names older version ${version} twice`);
    }
  }
  return inconsistencies;
}

describe('the consistency check', () => {
  test('names a version that is no whole number of at least 1', () => {
    expect(inconsistenciesOf({ exampleMonitor: 0, exampleSummary: 1.5 }, {})).toEqual(['exampleMonitor has version 0', 'exampleSummary has version 1.5']);
  });

  test('names an older version at or above the current one, one named twice, and one of a contract with no version', () => {
    const versions = { exampleMonitor: 3 };

    expect(inconsistenciesOf(versions, { exampleMonitor: [1, 3] })).toEqual(['exampleMonitor names older version 3']);
    expect(inconsistenciesOf(versions, { exampleMonitor: [1, 1] })).toEqual(['exampleMonitor names older version 1 twice']);
    expect(inconsistenciesOf(versions, { exampleRetired: [1] })).toEqual(['exampleRetired has older versions but no version']);
  });
});

describe('the Overseer contract versions', () => {
  test('hold together: whole versions, and older versions below the current ones, each named once', () => {
    expect(inconsistenciesOf(OVERSEER_CONTRACT_VERSIONS, OLDER_OVERSEER_CONTRACT_VERSIONS)).toEqual([]);
  });

  test('serve the control version Flint\'s brain needs, or a later one', () => {
    expect(OVERSEER_CONTRACT_VERSIONS.control).toBeGreaterThanOrEqual(FLINT_BRAIN_CONTRACT_VERSIONS.control);
  });
});
