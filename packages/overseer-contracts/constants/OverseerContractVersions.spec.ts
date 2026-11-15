/**
 * The versions are the one table a producer and a reader of the Overseer's contracts share, so they must hold together: every version is
 * a whole major of at least 1 and a whole minor, every older major lies below its contract's current one and is named once, and Flint's
 * brain needs a control major that the table serves. Each check is planted with a table that breaks it, to prove it names the break.
 */
import { describe, expect, test } from 'bun:test';

import type { ContractVersion }                                                                      from '../@types/ContractVersion.ts';
import { FLINT_BRAIN_CONTRACT_VERSIONS, OLDER_OVERSEER_CONTRACT_MAJORS, OVERSEER_CONTRACT_VERSIONS } from './OverseerContractVersions.ts';

type VersionTable = Readonly<Record<string, ContractVersion>>;

type OlderMajorTable = Readonly<Record<string, readonly number[]>>;

function isWholeNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function inconsistenciesOf(versions: VersionTable, olderMajors: OlderMajorTable): readonly string[] {
  const inconsistencies: string[] = [];
  for (const [contract, { major, minor }] of Object.entries(versions)) {
    if (!isWholeNumber(major) || major < 1) inconsistencies.push(`${contract} has major ${major}`);
    if (!isWholeNumber(minor)) inconsistencies.push(`${contract} has minor ${minor}`);
  }
  for (const [contract, majors] of Object.entries(olderMajors)) {
    const current = Object.hasOwn(versions, contract) ? versions[contract] : undefined;
    if (current === undefined) {
      inconsistencies.push(`${contract} has older majors but no version`);
      continue;
    }
    for (const [index, major] of majors.entries()) {
      if (!isWholeNumber(major) || major < 1 || major >= current.major) inconsistencies.push(`${contract} names older major ${major}`);
      if (majors.indexOf(major) !== index) inconsistencies.push(`${contract} names older major ${major} twice`);
    }
  }
  return inconsistencies;
}

describe('the consistency check', () => {
  test('names a version that is no whole major of at least 1, or no whole minor', () => {
    expect(inconsistenciesOf({ exampleMonitor: { major: 0, minor: 0.5 } }, {})).toEqual(['exampleMonitor has major 0', 'exampleMonitor has minor 0.5']);
  });

  test('names an older major at or above the current one, one named twice, and one of a contract with no version', () => {
    const versions = { exampleMonitor: { major: 3, minor: 0 } };

    expect(inconsistenciesOf(versions, { exampleMonitor: [1, 3] })).toEqual(['exampleMonitor names older major 3']);
    expect(inconsistenciesOf(versions, { exampleMonitor: [1, 1] })).toEqual(['exampleMonitor names older major 1 twice']);
    expect(inconsistenciesOf(versions, { exampleRetired: [1] })).toEqual(['exampleRetired has older majors but no version']);
  });
});

describe('the Overseer contract versions', () => {
  test('hold together: whole majors and minors, and older majors below the current ones, each named once', () => {
    expect(inconsistenciesOf(OVERSEER_CONTRACT_VERSIONS, OLDER_OVERSEER_CONTRACT_MAJORS)).toEqual([]);
  });

  test('serve the control major Flint\'s brain needs, or a later one', () => {
    expect(OVERSEER_CONTRACT_VERSIONS.control.major).toBeGreaterThanOrEqual(FLINT_BRAIN_CONTRACT_VERSIONS.control);
  });
});
