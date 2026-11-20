/**
 * `docs/contracts.md` names every versioned contract with its one version (a whole number, or a stored format's major.minor), which
 * `CONTRACT_VERSIONS` holds for the forge's contracts and Gaia's stored files and `PAGE_CONTRACT_VERSIONS` for what Gaia serves its page,
 * no key in both; each of Gaia's routes at its endpoint version, which `GAIA_ENDPOINT_VERSIONS` holds; and the verdicts on a
 * forge, exactly those of `ForgeVersionsVerdict`. What matters: each table and its source agree both ways, a key or a version missing from
 * either side, a version that differs in its number or its form and a key listed twice each named. The reading first proves it found each
 * table, and each disagreement is planted to prove the comparison names it.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { ForgeVersionsVerdict } from '../@types/ForgeReading.ts';
import type { FormatVersion }        from '../utils/ContractVersionUtil.ts';
import { CONTRACT_VERSIONS }         from './ContractVersions.ts';
import { GAIA_ENDPOINT_VERSIONS }    from './GaiaSystemVersions.ts';
import { PAGE_CONTRACT_VERSIONS }    from './PageContractVersions.ts';

const CONTRACTS_REFERENCE_PATH = join(import.meta.dir, '..', '..', '..', 'docs', 'contracts.md');
const VERSIONED_CONTRACTS_HEADING = '## Versioned contracts';
const ENDPOINTS_HEADING = '## Gaia\'s endpoints';
const VERDICTS_HEADING = '## The verdict on a forge';
const VERDICT_ROW = /^\|\s*`(?<verdict>[a-z-]+)`\s*\|/;

/** Keyed by the verdict union, so a verdict added to or removed from it fails the typecheck here until the reference follows. */
const VERDICTS_GAIA_DECIDES: Readonly<Record<ForgeVersionsVerdict, true>> = {
  current: true,
  ahead:   true,
  newer:   true,
  older:   true,
};
const NEXT_SECTION_HEADING = /^## /;
const CONTRACT_ROW = /^\|\s*`(?<contractKey>[A-Za-z]+)`\s*\|\s*(?<version>\d+(?:\.\d+)?)\s*\|/;

/** `version` is the row's text: `3`, or a stored format's `1.0`. */
interface ReferenceRow {
  readonly contractKey: string;
  readonly version:     string;
}

type KnownVersions = Readonly<Record<string, number | FormatVersion>>;

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
    return contractKey === undefined || version === undefined ? [] : [{ contractKey, version }];
  });
}

function versionTextOf(version: number | FormatVersion | undefined): string {
  if (version === undefined) return 'absent';
  return typeof version === 'number' ? String(version) : `${version.major}.${version.minor}`;
}

function disagreementsBetween(rows: readonly ReferenceRow[], knownVersions: KnownVersions, constantName = 'CONTRACT_VERSIONS'): readonly string[] {
  const disagreements: string[] = [];
  const listedKeys = new Set<string>();
  for (const row of rows) {
    if (listedKeys.has(row.contractKey)) disagreements.push(`${row.contractKey} is listed more than once`);
    listedKeys.add(row.contractKey);
    if (!Object.hasOwn(knownVersions, row.contractKey)) {
      disagreements.push(`${row.contractKey} is not in ${constantName}`);
      continue;
    }
    const knownVersion = knownVersions[row.contractKey];
    const knownVersionText = versionTextOf(knownVersion);
    if (knownVersionText !== row.version) disagreements.push(`${row.contractKey} is ${row.version} in the reference and ${knownVersionText} in ${constantName}`);
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

const PLANTED_VERSIONS: KnownVersions = { exampleRegistry: { major: 1, minor: 0 }, exampleMonitor: 2 };

describe('the comparison of the reference with the known versions', () => {
  test('finds no disagreement when every key is listed once at its number', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1.0 | `version` |', '| `exampleMonitor` | 2 | `monitorVersion` |']));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual([]);
  });

  test('names a known key the reference leaves out', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1.0 | `version` |']));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleMonitor is missing from the reference']);
  });

  test('names a listed key that CONTRACT_VERSIONS does not hold', () => {
    const rows = referenceRowsOf(referenceWithRows([
      '| `exampleRegistry` | 1.0 | `version` |',
      '| `exampleMonitor` | 2 | `monitorVersion` |',
      '| `exampleRetired` | 1.0 | `version` |',
    ]));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleRetired is not in CONTRACT_VERSIONS']);
  });

  test('names a version that differs from the known one', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1.1 | `version` |', '| `exampleMonitor` | 1 | `monitorVersion` |']));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual([
      'exampleRegistry is 1.1 in the reference and 1.0 in CONTRACT_VERSIONS',
      'exampleMonitor is 1 in the reference and 2 in CONTRACT_VERSIONS',
    ]);
  });

  test('names a stored format written without its minor, and a whole version written with one', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1 | `version` |', '| `exampleMonitor` | 2.0 | `monitorVersion` |']));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual([
      'exampleRegistry is 1 in the reference and 1.0 in CONTRACT_VERSIONS',
      'exampleMonitor is 2.0 in the reference and 2 in CONTRACT_VERSIONS',
    ]);
  });

  test('names a key listed twice', () => {
    const rows = referenceRowsOf(referenceWithRows([
      '| `exampleRegistry` | 1.0 | `version` |',
      '| `exampleMonitor` | 2 | `monitorVersion` |',
      '| `exampleRegistry` | 1.0 | `version` |',
    ]));

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleRegistry is listed more than once']);
  });

  test('reads only the rows under the versioned contracts heading', () => {
    const rows = referenceRowsOf(referenceWithRows(['| `exampleRegistry` | 1.0 | `version` |']));

    expect(rows).toEqual([{ contractKey: 'exampleRegistry', version: '1.0' }]);
  });

  test('reads no row from a reference without the heading, so every known key is named as missing', () => {
    const rows = referenceRowsOf('# Contracts\n\n| `exampleRegistry` | 1.0 | `version` |\n');

    expect(disagreementsBetween(rows, PLANTED_VERSIONS)).toEqual(['exampleRegistry is missing from the reference', 'exampleMonitor is missing from the reference']);
  });
});

describe('docs/contracts.md', () => {
  const contractsReferenceRows = (): readonly ReferenceRow[] => referenceRowsOf(readFileSync(CONTRACTS_REFERENCE_PATH, 'utf8'));

  test('holds a table of versioned contracts', () => {
    expect(contractsReferenceRows().length).toBeGreaterThan(0);
  });

  test('agrees with CONTRACT_VERSIONS and PAGE_CONTRACT_VERSIONS together on every key and number, both ways', () => {
    const knownVersions: KnownVersions = { ...CONTRACT_VERSIONS, ...PAGE_CONTRACT_VERSIONS };
    expect(disagreementsBetween(contractsReferenceRows(), knownVersions, 'CONTRACT_VERSIONS or PAGE_CONTRACT_VERSIONS')).toEqual([]);
  });

  test('no contract key is in both CONTRACT_VERSIONS and PAGE_CONTRACT_VERSIONS', () => {
    expect(Object.keys(PAGE_CONTRACT_VERSIONS).filter((contractKey) => Object.hasOwn(CONTRACT_VERSIONS, contractKey))).toEqual([]);
  });

  test('names no older version Gaia still reads: it reads only the contracts of the one forge version it supports', () => {
    expect(readFileSync(CONTRACTS_REFERENCE_PATH, 'utf8')).not.toContain('## Older versions');
  });

  test('lists exactly the four verdicts on a forge, each once', () => {
    const verdicts = sectionOf(readFileSync(CONTRACTS_REFERENCE_PATH, 'utf8'), VERDICTS_HEADING).flatMap((line) => VERDICT_ROW.exec(line)?.groups?.['verdict'] ?? []);
    expect([...verdicts].sort()).toEqual(Object.keys(VERDICTS_GAIA_DECIDES).sort());
  });

  test('names each of Gaia\'s routes at its endpoint version, and agrees with GAIA_ENDPOINT_VERSIONS on each, both ways', () => {
    const endpointRows = referenceRowsOf(readFileSync(CONTRACTS_REFERENCE_PATH, 'utf8'), ENDPOINTS_HEADING);
    expect(endpointRows.length).toBeGreaterThan(0);
    expect(disagreementsBetween(endpointRows, GAIA_ENDPOINT_VERSIONS, 'GAIA_ENDPOINT_VERSIONS')).toEqual([]);
  });
});
