/**
 * `docs/contracts.md` names every versioned contract with its number and the older numbers Gaia still reads, and `CONTRACT_VERSIONS` and
 * `OLDER_CONTRACT_VERSIONS_READ` hold the numbers. What matters: each of the reference's two tables and its constant agree both ways, a key
 * or a number missing from either side, a number that differs and a key listed twice each named. The reading first proves it found each
 * table, and each disagreement is planted to prove the comparison names it.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { CONTRACT_VERSIONS, OLDER_CONTRACT_VERSIONS_READ } from './ContractVersions.ts';

const CONTRACTS_REFERENCE_PATH = join(import.meta.dir, '..', '..', '..', 'docs', 'contracts.md');
const VERSIONED_CONTRACTS_HEADING = '## Versioned contracts';
const OLDER_VERSIONS_HEADING = '## Older versions Gaia still reads';
const NEXT_SECTION_HEADING = /^## /;
const CONTRACT_ROW = /^\|\s*`(?<contractKey>[A-Za-z]+)`\s*\|\s*(?<version>\d+)\s*\|/;

interface ReferenceRow {
  readonly contractKey: string;
  readonly version:     number;
}

type KnownVersions = Readonly<Record<string, number>>;

type ListedVersions = Readonly<Record<string, readonly number[]>>;

function sectionOf(reference: string, heading: string): readonly string[] {
  const lines = reference.split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex === -1) return [];
  const sectionLines = lines.slice(headingIndex + 1);
  const nextHeadingIndex = sectionLines.findIndex((line) => NEXT_SECTION_HEADING.test(line));
  return nextHeadingIndex === -1 ? sectionLines : sectionLines.slice(0, nextHeadingIndex);
}

function referenceRowsOf(reference: string, heading: string = VERSIONED_CONTRACTS_HEADING): readonly ReferenceRow[] {
  return sectionOf(reference, heading).flatMap((line) => {
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

/** Each older number is named once on each side: `forgeMonitor 1`. */
function listedVersionDisagreementsBetween(rows: readonly ReferenceRow[], listedVersions: ListedVersions, constantName: string): readonly string[] {
  const listed = rows.map(({ contractKey, version }) => `${contractKey} ${version}`);
  const known = Object.entries(listedVersions).flatMap(([contractKey, versions]) => versions.map((version) => `${contractKey} ${version}`));
  return [
    ...listed.filter((entry, index) => listed.indexOf(entry) !== index).map((entry) => `${entry} is listed more than once`),
    ...listed.filter((entry) => !known.includes(entry)).map((entry) => `${entry} is not in ${constantName}`),
    ...known.filter((entry) => !listed.includes(entry)).map((entry) => `${entry} is missing from the reference`),
  ];
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

describe('the comparison of the older versions the reference lists with those Gaia reads', () => {
  const PLANTED_OLDER_VERSIONS: ListedVersions = { exampleMonitor: [1] };
  const olderVersionDisagreementsBetween = (rows: readonly ReferenceRow[], olderVersions: ListedVersions): readonly string[] => (
    listedVersionDisagreementsBetween(rows, olderVersions, 'OLDER_CONTRACT_VERSIONS_READ')
  );
  const olderRowsOf = (rowLines: readonly string[]): readonly ReferenceRow[] => referenceRowsOf(
    ['# Contracts', '', OLDER_VERSIONS_HEADING, '', '| Key | Older version |', '| --- | --- |', ...rowLines].join('\n'),
    OLDER_VERSIONS_HEADING,
  );

  test('finds no disagreement when every older number is listed once', () => {
    expect(olderVersionDisagreementsBetween(olderRowsOf(['| `exampleMonitor` | 1 |']), PLANTED_OLDER_VERSIONS)).toEqual([]);
  });

  test('names an older number the reference leaves out, one it lists that Gaia does not read, and one it lists twice', () => {
    expect(olderVersionDisagreementsBetween(olderRowsOf([]), PLANTED_OLDER_VERSIONS)).toEqual(['exampleMonitor 1 is missing from the reference']);
    expect(olderVersionDisagreementsBetween(olderRowsOf(['| `exampleMonitor` | 1 |', '| `exampleMonitor` | 0 |']), PLANTED_OLDER_VERSIONS))
      .toEqual(['exampleMonitor 0 is not in OLDER_CONTRACT_VERSIONS_READ']);
    expect(olderVersionDisagreementsBetween(olderRowsOf(['| `exampleMonitor` | 1 |', '| `exampleMonitor` | 1 |']), PLANTED_OLDER_VERSIONS))
      .toEqual(['exampleMonitor 1 is listed more than once']);
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

  test('lists the older numbers Gaia still reads, and agrees with OLDER_CONTRACT_VERSIONS_READ on each, both ways', () => {
    const olderRows = referenceRowsOf(readFileSync(CONTRACTS_REFERENCE_PATH, 'utf8'), OLDER_VERSIONS_HEADING);
    expect(olderRows.length).toBeGreaterThan(0);
    expect(listedVersionDisagreementsBetween(olderRows, OLDER_CONTRACT_VERSIONS_READ, 'OLDER_CONTRACT_VERSIONS_READ')).toEqual([]);
  });

  test('names every older number below its contract\'s current one', () => {
    for (const [contractKey, versions] of Object.entries(OLDER_CONTRACT_VERSIONS_READ)) {
      const currentVersion = Object.hasOwn(CONTRACT_VERSIONS, contractKey) ? CONTRACT_VERSIONS[contractKey as keyof typeof CONTRACT_VERSIONS] : 0;
      for (const version of versions) expect(version).toBeLessThan(currentVersion);
    }
  });
});
