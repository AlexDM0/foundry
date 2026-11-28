/**
 * `hephaestus.log` read back. What matters: a stored line reads as its `at`, kind and details; each read gives only the whole lines appended
 * since the last; a line that is no record is a reading of its own with its line number, never a throw; and a missing file is absent.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { join }                          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { HephaestusLogWordingUtil }                       from '../utils/HephaestusLogWordingUtil.ts';
import { HephaestusLogIngestion }                         from './HephaestusLogIngestion.ts';
import { HephaestusLogProblemWording }                    from './HephaestusLogProblemWording.ts';

const AT = '2026-11-27T10:00:00+01:00';

let scratchDirectory = '';

const logFilePath = (): string => join(scratchDirectory, 'hephaestus.log');

beforeEach(() => {
  scratchDirectory = createScratchDirectory('hephaestus-log-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(new HephaestusLogIngestion(logFilePath()).read()).toEqual({ verdict: 'absent' });
});

test('a stored line reads as its at, kind and details, and each read gives only the whole lines appended since the last', () => {
  const ingestion = new HephaestusLogIngestion(logFilePath());
  appendFileSync(logFilePath(), `${HephaestusLogWordingUtil.storedLineOf({ kind: 'stop-signal-received' }, AT)}\n`);
  const firstLine = { at: AT, kind: 'stop-signal-received', details: 'Stop signal received.' };
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [{ verdict: 'record', lineNumber: 1, line: firstLine }] });
  appendFileSync(logFilePath(), HephaestusLogWordingUtil.storedLineOf({ kind: 'talos-attached', talosStartNumber: 2 }, AT));
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [] });
  appendFileSync(logFilePath(), '\n');
  const secondLine = { at: AT, kind: 'talos-attached', details: 'Attached to Talos 2.' };
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [{ verdict: 'record', lineNumber: 2, line: secondLine }] });
});

test('a line that is no record is read as such with its number, among the records, and a blank line is passed over', () => {
  writeFileSync(logFilePath(), [
    'refused: the install version differs',
    '',
    '[1, 2]',
    JSON.stringify({ at: AT, kind: 'stop-signal-received', details: 7 }),
    HephaestusLogWordingUtil.storedLineOf({ kind: 'hephaestus-stopped' }, AT),
    '',
  ].join('\n'));
  const reading = new HephaestusLogIngestion(logFilePath()).read();
  if (reading.verdict !== 'readable') throw new Error(`expected a readable log, got ${reading.verdict}`);
  expect(reading.lines.map((line) => (line.verdict === 'record' ? [line.lineNumber, line.line.details] : [line.lineNumber, line.problem.code]))).toEqual([
    [1, 'not-json'],
    [3, 'not-a-json-object'],
    [4, 'field-not-a-string'],
    [5, 'Hephaestus stopped; its Hephaestus lock is released.'],
  ]);
  const mistyped = reading.lines[2];
  expect(mistyped?.verdict === 'not-a-record' ? HephaestusLogProblemWording.sentenceOf(mistyped.problem) : null).toBe('its "details" is not a string');
});

test('a line that is not UTF-8 is no record, and the lines after it still read', () => {
  writeFileSync(logFilePath(), Buffer.concat([Buffer.from([0xff, 0xfe, 0x0a]), Buffer.from(`${HephaestusLogWordingUtil.storedLineOf({ kind: 'hephaestus-stopped' }, AT)}\n`)]));
  const reading = new HephaestusLogIngestion(logFilePath()).read();
  expect(reading.verdict === 'readable' ? reading.lines.map((line) => line.verdict) : reading.verdict).toEqual(['not-a-record', 'record']);
});

test('a log cut shorter than what was read is read again from its start', () => {
  const ingestion = new HephaestusLogIngestion(logFilePath());
  writeFileSync(logFilePath(), `${HephaestusLogWordingUtil.storedLineOf({ kind: 'hephaestus-stopped' }, AT)}\n`);
  ingestion.read();
  writeFileSync(logFilePath(), `${HephaestusLogWordingUtil.storedLineOf({ kind: 'stop-signal-received' }, AT)}\n`);
  const reading = ingestion.read();
  expect(reading.verdict === 'readable' ? reading.lines.map((line) => line.lineNumber) : reading.verdict).toEqual([1]);
});

test('a single stored line reads as a record, and any other text as no record', () => {
  expect(HephaestusLogIngestion.lineOf(HephaestusLogWordingUtil.storedLineOf({ kind: 'hephaestus-stopped' }, AT)).verdict).toBe('record');
  expect(HephaestusLogIngestion.lineOf('2026-11-27T10:00:00+01:00 Hephaestus stopped; its Hephaestus lock is released.').verdict).toBe('not-a-record');
});
