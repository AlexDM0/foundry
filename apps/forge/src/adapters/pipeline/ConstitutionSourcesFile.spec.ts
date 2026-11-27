/**
 * `constitution-sources.json` both ways. What matters: written sources read back whole and write back byte for byte, their own keys first
 * and every top-level key this build does not know after them, in stored order; no file is `absent`; a file nobody could trust whole is
 * `malformed` with a reason, never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';

import type { StoredConstitutionSources }                 from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { ConstitutionSourcesFile }                        from './ConstitutionSourcesFile.ts';
import { PipelineSetupProblemWording }                    from './PipelineSetupProblemWording.ts';

const EXAMPLE_BLOB = 'c'.repeat(40);

const EXAMPLE_SOURCES: StoredConstitutionSources = {
  formatVersion: 1,
  blob:          EXAMPLE_BLOB,
  annotations:   [
    {
      lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
    },
    {
      lineText: '- Name things in full.', occurrence: 2, kind: 'contributing', path: 'CONTRIBUTING.md'
    },
  ],
  extra: [],
};

let directory = '';
let sourcesFilePath = '';

beforeEach(() => {
  directory = createScratchDirectory('constitution-sources-file');
  sourcesFilePath = join(directory, 'constitution-sources.json');
});

afterEach(() => {
  removeScratchDirectory(directory);
});

describe('a round trip', () => {
  test('written sources read back whole and write back byte for byte', () => {
    const contents = ConstitutionSourcesFile.contentsOf(EXAMPLE_SOURCES);
    writeFileSync(sourcesFilePath, contents);

    const reading = ConstitutionSourcesFile.read(sourcesFilePath);

    expect(reading).toEqual({ verdict: 'readable', sources: EXAMPLE_SOURCES });
    expect(reading.verdict === 'readable' ? ConstitutionSourcesFile.contentsOf(reading.sources) : null).toBe(contents);
  });

  test('top-level keys this build does not know stay after its own, in stored order', () => {
    const storedText = `${JSON.stringify({
      laterKey: { kept: true }, formatVersion: 1, blob: EXAMPLE_BLOB, annotations: [], anotherKey: [1, 2]
    }, null, 2)}\n`;
    writeFileSync(sourcesFilePath, storedText);

    const reading = ConstitutionSourcesFile.read(sourcesFilePath);
    if (reading.verdict !== 'readable') throw new Error(`the file did not read: ${JSON.stringify(reading)}`);

    expect(reading.sources.extra).toEqual([['laterKey', { kept: true }], ['anotherKey', [1, 2]]]);
    const rewritten = ConstitutionSourcesFile.contentsOf(reading.sources);
    expect(Object.keys(JSON.parse(rewritten) as object)).toEqual(['formatVersion', 'blob', 'annotations', 'laterKey', 'anotherKey']);
    writeFileSync(sourcesFilePath, rewritten);
    const reread = ConstitutionSourcesFile.read(sourcesFilePath);
    expect(reread.verdict === 'readable' ? ConstitutionSourcesFile.contentsOf(reread.sources) : null).toBe(rewritten);
  });

  test('no file is absent', () => {
    expect(ConstitutionSourcesFile.read(sourcesFilePath)).toEqual({ verdict: 'absent' });
  });
});

describe('a file nobody could trust whole', () => {
  test.each([
    ['not JSON', '{ "formatVersion": 1, '],
    ['another format version', JSON.stringify({ formatVersion: 2, blob: EXAMPLE_BLOB, annotations: [] })],
    ['no blob id', JSON.stringify({ formatVersion: 1, blob: '', annotations: [] })],
    ['annotations that are no list', JSON.stringify({ formatVersion: 1, blob: EXAMPLE_BLOB, annotations: {} })],
    ['an annotation of an unknown kind', JSON.stringify({
      formatVersion: 1,
      blob:          EXAMPLE_BLOB,
      annotations:   [{
        lineText: '- Rule.', occurrence: 1, kind: 'guess', path: null
      }]
    })],
    ['an annotation with a key the read does not know', JSON.stringify({
      formatVersion: 1,
      blob:          EXAMPLE_BLOB,
      annotations:   [{
        lineText: '- Rule.', occurrence: 1, kind: 'research', path: null, note: 'x'
      }]
    })],
  ])('%s is malformed with a reason, never a throw', (_case, storedText) => {
    writeFileSync(sourcesFilePath, storedText);

    const reading = ConstitutionSourcesFile.read(sourcesFilePath);

    expect(reading.verdict).toBe('malformed');
    expect(reading.verdict === 'malformed' ? PipelineSetupProblemWording.constitutionSourcesSentenceOf(reading.problem).length : 0).toBeGreaterThan(0);
  });
});
