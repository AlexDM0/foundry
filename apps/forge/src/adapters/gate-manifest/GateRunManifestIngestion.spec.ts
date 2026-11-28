/**
 * A gate run's manifest both ways: what the writer stores reads back the same, a missing file is absent since the run has not started,
 * and any manifest of the wrong version, phase or shape is unreadable, so no run goes on from a part of it, and nothing throws.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                                   from '../../testing/ScratchWorkspace.ts';
import type { GateRunManifestProblem }                                                      from './@types/GateRunManifestProblem.ts';
import { GATE_RUN_MANIFEST_FORMAT_VERSION, type GateRunManifest, GateRunManifestIngestion } from './GateRunManifestIngestion.ts';
import { createGateRunManifestWriter }                                                      from './GateRunManifestWriter.ts';

let scratchDirectory = '';

const manifestFilePath = (): string => join(scratchDirectory, 'gate-run.json');

const reading = (): ReturnType<GateRunManifestIngestion['read']> => new GateRunManifestIngestion(manifestFilePath(), 'build').read();

const PACKAGE_BUILD_MANIFEST: GateRunManifest = {
  phase:             'build',
  phaseHash:         'example-phase-hash',
  entityPhaseHashes: { tool: 'tool-phase-hash', shop: 'shop-phase-hash' },
  prepare:           [{ name: 'install', run: 'bun install', in: 'packages/tool' }, { name: 'install', run: 'bun install', entity: 'shop' }],
  gates:             [
    {
      name: 'tests', run: 'bun test', fix: 'bun run fix', in: '/', definedBy: ['*.spec.ts'], network: ['example.com'], writes: ['~/.cache'], forgeOnly: true
    },
    { name: 'shop: lint', run: 'bun run lint', entity: 'shop' },
  ],
};

function storeDocument(document: Record<string, unknown>): void {
  writeFileSync(manifestFilePath(), `${JSON.stringify(document)}\n`);
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('gate-run-manifest-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same manifest, with its version', () => {
  createGateRunManifestWriter(manifestFilePath()).write(PACKAGE_BUILD_MANIFEST);
  expect(reading()).toEqual({ verdict: 'readable', manifest: PACKAGE_BUILD_MANIFEST });
});

test('a manifest of no gates reads back with none', () => {
  const empty: GateRunManifest = {
    phase: 'build', phaseHash: 'example-phase-hash', prepare: [], gates: []
  };
  createGateRunManifestWriter(manifestFilePath()).write(empty);
  expect(reading()).toEqual({ verdict: 'readable', manifest: empty });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(manifestFilePath(), '{ "phase": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a manifest of another version, or of none, is unreadable', () => {
  storeDocument({ ...PACKAGE_BUILD_MANIFEST, version: GATE_RUN_MANIFEST_FORMAT_VERSION + 1 });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: GATE_RUN_MANIFEST_FORMAT_VERSION } });
  storeDocument({ ...PACKAGE_BUILD_MANIFEST });
  expect(reading()).toEqual({ verdict: 'unreadable', problem: { code: 'version-differs', field: 'version', expectedVersion: GATE_RUN_MANIFEST_FORMAT_VERSION } });
});

const [OWN_GATE] = PACKAGE_BUILD_MANIFEST.gates;

test.each<[string, Record<string, unknown>, GateRunManifestProblem]>([
  ['phase', { phase: 'review' }, { code: 'not-the-phase', field: 'phase', expectedPhase: 'build' }],
  ['phaseHash', { phaseHash: null }, { code: 'field-is-not', field: 'phaseHash', expected: 'text' }],
  ['entityPhaseHashes', { entityPhaseHashes: ['tool'] }, { code: 'field-is-not', field: 'entityPhaseHashes', expected: 'a-record-of-phase-hashes' }],
  ['prepare', { prepare: {} }, { code: 'field-is-not', field: 'prepare', expected: 'a-list' }],
  ['prepare entry', { prepare: ['bun install'] }, { code: 'field-is-not', field: 'prepare[0]', expected: 'an-object' }],
  ['prepare run', { prepare: [{ name: 'install' }] }, { code: 'field-is-not', field: 'prepare[0].run', expected: 'text' }],
  ['gates', { gates: null }, { code: 'field-is-not', field: 'gates', expected: 'a-list' }],
  ['gate network', { gates: [{ ...OWN_GATE, network: 'example.com' }] }, { code: 'field-is-not', field: 'gates[0].network', expected: 'a-list-of-text' }],
  ['gate forgeOnly', { gates: [{ ...OWN_GATE, forgeOnly: false }] }, { code: 'field-is-not', field: 'gates[0].forgeOnly', expected: 'true' }],
  ['gate entity', { gates: [OWN_GATE, { name: 'lint', run: 'bun run lint', entity: 3 }] }, { code: 'field-is-not', field: 'gates[1].entity', expected: 'text' }],
])('a wrong %s is unreadable', (_field, change, problem) => {
  storeDocument({ version: GATE_RUN_MANIFEST_FORMAT_VERSION, ...PACKAGE_BUILD_MANIFEST, ...change });
  expect(reading()).toEqual({ verdict: 'unreadable', problem });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new GateRunManifestIngestion(scratchDirectory, 'build');
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
