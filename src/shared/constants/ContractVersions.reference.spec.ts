/**
 * `docs/contracts.md` names every versioned contract with its number, and `CONTRACT_VERSIONS` holds the numbers. What matters: the
 * reference's table and the constant agree both ways, a key missing from either side, a number that differs and a key listed twice each
 * named. The reading first proves it found the table, and each disagreement is planted to prove the comparison names it.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { CONTRACT_VERSIONS } from './ContractVersions.ts';

const CONTRACTS_REFERENCE_PATH = join(import.meta.dir, '..', '..', '..', 'docs', 'contracts.md');
const VERSIONED_CONTRACTS_HEADING = '## Versioned contracts';
const NEXT_SECTION_HEADING = /^## /;
const CONTRACT_ROW = /^\|\s*`(?<contractKey>[A-Za-z]+)`\s*\|\s*(?<version>\d+)\s*\|/;

interface ReferenceRow {
  readonly contractKey: string;
  readonly version:     number;
}

type KnownVersions = Readonly<Record<string, number>>;

function versionedContractsSectionOf(reference: string): readonly string[] {
  const lines = reference.split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === VERSIONED_CONTRACTS_HEADING);
  if (headingIndex === -1) return [];
  const sectionLines = lines.slice(headingIndex + 1);
  const nextHeadingIndex = sectionLines.findIndex((line) => NEXT_SECTION_HEADING.test(line));
  return nextHeadingIndex === -1 ? sectionLines : sectionLines.slice(0, nextHeadingIndex);
}

function referenceRowsOf(reference: string): readonly ReferenceRow[] {
  return versionedContractsSectionOf(reference).flatMap((line) => {
    const groups = CONTRACT_ROW.exec(line)?.groups;
    const contractKey = groups?.['contractKey'];
    const version = groups?.['version'];
    return contractKey === undefined || version === undefined ? [] : [{ contractKey, version: Number(version) }];
  });
}

function disagreementsBetween(rows: readonly ReferenceRow[], knownVersions: KnownVersions): readonly string[] {
  const disagreements: string[] = [];
  const listedKeys = new Set<string>();
  for (const row of rows) {
    if (listedKeys.has(row.contractKey)) disagreements.push(`${row.contractKey} is listed more than once`);
    listedKeys.add(row.contractKey);
    if (!Object.hasOwn(knownVersions, row.contractKey)) {
      disagreements.push(`${row.contractKey} is not in CONTRACT_VERSIONS`);
      continue;
    }
    const knownVersion = knownVersions[row.contractKey];
    if (knownVersion !== row.version) disagreements.push(`${row.contractKey} is ${row.version} in the reference and ${String(knownVersion)} in CONTRACT_VERSIONS`);
  }
  for (const contractKey of Object.keys(knownVersions)) {
    if (!listedKeys.has(contractKey)) disagreements.push(`${contractKey} is missing from the reference`);
  }
  return disagreements;
}

function referenceWithRows(rowLines: readonly string[]): string {
  return [
    '# Contracts',
    '',
    VERSIONED_CONTRACTS_HEADING,
    '',
    '| Key in `CONTRACT_VERSIONS` | Version | Version key |',
    '| --- | --- | --- |',
    ...rowLines,
    '',
    '## The install version',
    '',
    '| `exampleOutsideTheTable` | 7 | `version` |',
  ].join('\n');
}

const PLANTED_VERSIONS: KnownVersions = { exampleRegistry: 1, exampleMonitor: 2 };

describe('the comparison of the reference with the known versions', () => {
  test('finds no disagreement when every key is listed once at its number', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1 | `version` |', '| `exampleMonitor` | 2 | `monitorVersion` |']));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual([]);
  });

  test('names a known key the reference leaves out', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1 | `version` |']));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleMonitor is missing from the reference']);
  });

  test('names a listed key that CONTRACT_VERSIONS does not hold', () => {
    const rows = referenceRowsOf(referenceWithRows([
      '| `exampleRegistry` | 1 | `version` |',
      '| `exampleMonitor` | 2 | `monitorVersion` |',
      '| `exampleRetired` | 1 | `version` |',
    ]));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleRetired is not in CONTRACT_VERSIONS']);
  });

  test('names a number that differs from the known one', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1 | `version` |', '| `exampleMonitor` | 1 | `monitorVersion` |']));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleMonitor is 1 in the reference and 2 in CONTRACT_VERSIONS']);
  });

  test('names a key listed twice', () => {
    const rows = referenceRowsOf(referenceWithRows([
      '| `exampleRegistry` | 1 | `version` |',
      '| `exampleMonitor` | 2 | `monitorVersion` |',
      '| `exampleRegistry` | 1 | `version` |',
    ]));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleRegistry is listed more than once']);
  });

  test('reads only the rows under the versioned contracts heading', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1 | `version` |']));

    expect(rows).toEqual([{ contractKey: 'exampleRegistry', version: 1 }]);
  });

  test('reads no row from a reference without the heading, so every known key is named as missing', () => {
    const rows = referenceRowsOf('# Contracts\n\n| `exampleRegistry` | 1 | `version` |\n');

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleRegistry is missing from the reference', 'exampleMonitor is missing from the reference']);
  });
});

describe('docs/contracts.md', () => {
  const contractsReferenceRows = (): readonly ReferenceRow[] => referenceRowsOf(readFileSync(CONTRACTS_REFERENCE_PATH, 'utf8'));

  test('holds a table of versioned contracts', () => {
    expect(contractsReferenceRows().length).toBeGreaterThan(0);
  });

  test('agrees with CONTRACT_VERSIONS on every key and number, both ways', () => {
    expect(disagreementsBetween(contractsReferenceRows(), CONTRACT_VERSIONS)).toEqual([]);
  });
});
