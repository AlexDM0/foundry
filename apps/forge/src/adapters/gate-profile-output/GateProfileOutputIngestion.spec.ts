/**
 * A gate profile's output format both ways. What matters: what the writer appends reads back as the same texts, each read giving only the
 * lines appended since the last; an unterminated last line waits for its line feed; a missing file is absent; and a line that is not
 * JSON, of no or another version, or with no text, is an unreadable line among readable ones, never thrown.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join }                      from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                 from '../../testing/ScratchWorkspace.ts';
import { GATE_PROFILE_OUTPUT_FORMAT_VERSION, GateProfileOutputIngestion } from './GateProfileOutputIngestion.ts';
import { createGateProfileOutputWriter }                                  from './GateProfileOutputWriter.ts';

let scratchDirectory = '';

const outputFilePath = (): string => join(scratchDirectory, 'P1.ndjson');

beforeEach(() => {
  scratchDirectory = createScratchDirectory('gate-profile-output-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(new GateProfileOutputIngestion(outputFilePath()).read()).toEqual({ verdict: 'absent' });
});

test('what the writer appends reads back as the same texts, each read giving only the lines appended since the last', () => {
  const writer = createGateProfileOutputWriter(outputFilePath());
  const ingestion = new GateProfileOutputIngestion(outputFilePath());
  writer.append('first\n');
  writer.append('second');
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [{ verdict: 'readable', text: 'first\n' }, { verdict: 'readable', text: 'second' }] });
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [] });
  writer.append('third');
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [{ verdict: 'readable', text: 'third' }] });
});

test('an unterminated last line waits for its line feed', () => {
  const lineText = `${JSON.stringify({ version: GATE_PROFILE_OUTPUT_FORMAT_VERSION, text: 'whole' })}\n`;
  const ingestion = new GateProfileOutputIngestion(outputFilePath());
  appendFileSync(outputFilePath(), lineText.slice(0, 10));
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [] });
  appendFileSync(outputFilePath(), lineText.slice(10));
  expect(ingestion.read()).toEqual({ verdict: 'readable', lines: [{ verdict: 'readable', text: 'whole' }] });
});

test.each([
  ['not JSON', 'not json'],
  ['not an object', '[]'],
  ['no version', JSON.stringify({ text: 'example' })],
  ['another version', JSON.stringify({ version: GATE_PROFILE_OUTPUT_FORMAT_VERSION + 1, text: 'example' })],
  ['no text', JSON.stringify({ version: GATE_PROFILE_OUTPUT_FORMAT_VERSION, text: 3 })],
])('a line of %s is unreadable among readable ones', (_case, lineText) => {
  mkdirSync(scratchDirectory, { recursive: true });
  createGateProfileOutputWriter(outputFilePath()).append('before');
  appendFileSync(outputFilePath(), `${lineText}\n`);
  createGateProfileOutputWriter(outputFilePath()).append('after');
  const reading = new GateProfileOutputIngestion(outputFilePath()).read();
  expect(reading.verdict === 'readable' ? reading.lines.map((line) => line.verdict) : []).toEqual(['readable', 'unreadable', 'readable']);
});
